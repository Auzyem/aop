import { prisma } from '@aop/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@aop/utils';
import { logger } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import type { TransactionPhase, TransactionStatus, Prisma } from '@aop/db';
import {
  checkPhaseGate,
  nextPhaseState,
  computeRag,
  SLA_TARGETS_DAYS,
  type GateContext,
} from './phase-gate.service.js';
import { getCurrentPrice, TROY_OZ_PER_GRAM } from './lme.service.js';
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  AdvancePhaseInput,
  OverridePhaseInput,
  AddEventInput,
} from './transactions.schemas.js';

// ---------------------------------------------------------------------------
// Include shape for full transaction detail
// ---------------------------------------------------------------------------

const FULL_INCLUDE = {
  client: { select: { id: true, fullName: true, kycStatus: true, entityType: true } },
  agent: { select: { id: true, companyName: true } },
  phaseHistory: {
    orderBy: { enteredAt: 'asc' as const },
    include: { enteredByUser: { select: { id: true, email: true } } },
  },
  documents: {
    where: { isDeleted: false },
    orderBy: { uploadedAt: 'asc' as const },
  },
  costItems: { orderBy: { category: 'asc' as const } },
  disbursements: { orderBy: { trancheNo: 'asc' as const } },
  settlement: true,
  refinery: { select: { id: true, name: true } },
  createdByUser: { select: { id: true, email: true } },
} satisfies Prisma.TransactionInclude;

type FullTransaction = Prisma.TransactionGetPayload<{ include: typeof FULL_INCLUDE }>;

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

function assertAccess(tx: { agentId: string }, actor: AuthenticatedUser): void {
  if (actor.role === 'OPERATIONS' && actor.agentId && tx.agentId !== actor.agentId) {
    throw new ForbiddenError('You can only access transactions assigned to your agency');
  }
}

function agentScope(actor: AuthenticatedUser): Prisma.TransactionWhereInput {
  if (actor.role === 'OPERATIONS' && actor.agentId) {
    return { agentId: actor.agentId };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Transaction ID generation
// Format: AOP-{CC}-{YEAR}-{SEQ4}  e.g. AOP-UG-2025-0001
// ---------------------------------------------------------------------------

async function generateId(countryCode: string): Promise<string> {
  const cc = countryCode.toUpperCase();
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const count = await prisma.transaction.count({
    where: {
      countryCode: cc,
      createdAt: { gte: yearStart, lt: yearEnd },
    },
  });

  return `AOP-${cc}-${year}-${String(count + 1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Load helpers
// ---------------------------------------------------------------------------

async function loadFull(id: string): Promise<FullTransaction> {
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: FULL_INCLUDE,
  });
  if (!tx) throw new NotFoundError('Transaction', id);
  return tx;
}

async function buildGateContext(tx: FullTransaction): Promise<GateContext> {
  const hasRegulatoryReport =
    (await prisma.regulatoryReport.count({ where: { reportType: 'MONTHLY_TRANSACTION' } })) > 0;

  return {
    transaction: {
      phase: tx.phase,
      status: tx.status,
      goldWeightFine: tx.goldWeightFine !== null ? Number(tx.goldWeightFine) : null,
      assayPurity: tx.assayPurity !== null ? Number(tx.assayPurity) : null,
      lmePriceLocked: tx.lmePriceLocked !== null ? Number(tx.lmePriceLocked) : null,
      priceLockedAt: tx.priceLockedAt,
    },
    clientKycStatus: tx.client.kycStatus,
    documents: tx.documents.map((d) => ({
      documentType: d.documentType,
      approvalStatus: d.approvalStatus,
    })),
    costItems: tx.costItems.map((c) => ({
      estimatedUsd: c.estimatedUsd !== null ? Number(c.estimatedUsd) : null,
    })),
    disbursements: tx.disbursements.map((d) => ({
      trancheNo: d.trancheNo,
      status: d.status,
    })),
    settlement: tx.settlement ? { remittanceStatus: tx.settlement.remittanceStatus } : null,
    hasRegulatoryReport,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createTransaction(
  dto: CreateTransactionInput,
  actor: AuthenticatedUser,
): Promise<FullTransaction> {
  // OPERATIONS users must use their own agentId
  if (actor.role === 'OPERATIONS' && actor.agentId && dto.agentId !== actor.agentId) {
    throw new ForbiddenError('Operations users can only create transactions for their own agency');
  }

  let id: string;
  let attempts = 0;

  // Retry on unique-key conflict (race condition in ID generation)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    id = await generateId(dto.countryCode);
    try {
      await prisma.$transaction(async (trx) => {
        await trx.transaction.create({
          data: {
            id,
            clientId: dto.clientId,
            agentId: dto.agentId,
            countryCode: dto.countryCode.toUpperCase(),
            goldWeightGross: dto.goldWeightGross,
            assignedRefineryId: dto.assignedRefineryId,
            createdBy: actor.id,
          },
        });

        await trx.phaseHistory.create({
          data: {
            transactionId: id,
            phase: 'PHASE_1',
            enteredBy: actor.id,
          },
        });
      });
      break;
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === 'P2002' && ++attempts < 5) continue;
      throw err;
    }
  }

  return loadFull(id);
}

export async function listTransactions(
  query: ListTransactionsQuery,
  actor: AuthenticatedUser,
): Promise<{ transactions: unknown[]; total: number; page: number; limit: number }> {
  const { page, limit, phase, status, countryCode, agentId, clientId, dateFrom, dateTo } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.TransactionWhereInput = {
    ...agentScope(actor),
    ...(phase ? { phase: phase as TransactionPhase } : {}),
    ...(status ? { status: status as TransactionStatus } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(agentId ? { agentId } : {}),
    ...(clientId ? { clientId } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phase: true,
        status: true,
        countryCode: true,
        goldWeightGross: true,
        goldWeightFine: true,
        createdAt: true,
        updatedAt: true,
        client: { select: { id: true, fullName: true } },
        agent: { select: { id: true, companyName: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, total, page, limit };
}

export async function getTransactionById(
  id: string,
  actor: AuthenticatedUser,
): Promise<FullTransaction> {
  const tx = await loadFull(id);
  assertAccess(tx, actor);
  return tx;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export async function getTimeline(id: string, actor: AuthenticatedUser) {
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: {
      phase: true,
      status: true,
      agentId: true,
      phaseHistory: {
        orderBy: { enteredAt: 'asc' },
        include: { enteredByUser: { select: { id: true, email: true } } },
      },
    },
  });
  if (!tx) throw new NotFoundError('Transaction', id);
  assertAccess(tx, actor);

  const events = await prisma.auditEvent.findMany({
    where: { entityType: 'TRANSACTION', entityId: id },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return {
    phaseHistory: tx.phaseHistory.map((ph) => ({
      ...ph,
      slaTargetDays: SLA_TARGETS_DAYS[ph.phase],
      rag: ph.exitedAt ? null : computeRag(ph.phase, ph.enteredAt),
    })),
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      data: e.newValue,
      timestamp: e.createdAt,
      user: e.user,
    })),
  };
}

// ---------------------------------------------------------------------------
// Checklist (gate status for current phase)
// ---------------------------------------------------------------------------

export async function getChecklist(id: string, actor: AuthenticatedUser) {
  const tx = await loadFull(id);
  assertAccess(tx, actor);

  const gateCtx = await buildGateContext(tx);
  const { canAdvance, blockers } = checkPhaseGate(gateCtx);

  let nextLabel = '';
  const { phase, status } = tx;
  if (phase === 'PHASE_6' && status !== 'SETTLEMENT_PENDING') nextLabel = 'Settlement Pending';
  else if (phase !== 'PHASE_7') {
    const phaseLabels: Record<string, string> = {
      PHASE_1: 'Phase 2 — Assay & Deal Structuring',
      PHASE_2: 'Phase 3 — Logistics & Collection',
      PHASE_3: 'Phase 4 — Refinery Receipt & Assay',
      PHASE_4: 'Phase 5 — Disbursement',
      PHASE_5: 'Phase 6 — Settlement',
      PHASE_6: 'Phase 7 — Regulatory Closure',
    };
    nextLabel = phaseLabels[phase] ?? '';
  }

  return {
    transactionId: id,
    currentPhase: phase,
    currentStatus: status,
    canAdvance,
    blockers,
    nextPhaseLabel: nextLabel || null,
  };
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

const COMPANY_FEE_RATE = Number(process.env.COMPANY_FEE_RATE ?? '0.015');
const AGENT_FEE_RATE = Number(process.env.AGENT_FEE_RATE ?? '0.02');

export async function getValuation(id: string, actor: AuthenticatedUser) {
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: {
      agentId: true,
      goldWeightFine: true,
      costItems: { select: { estimatedUsd: true } },
    },
  });
  if (!tx) throw new NotFoundError('Transaction', id);
  assertAccess(tx, actor);

  if (!tx.goldWeightFine) {
    throw new ValidationError(
      'Gold weight fine is not yet set — assay must be completed before valuation',
    );
  }

  const lmePrice = await getCurrentPrice();
  const goldWeightFine = Number(tx.goldWeightFine);
  const grossValueUsd = (goldWeightFine / TROY_OZ_PER_GRAM) * lmePrice.priceUsdPerTroyOz;
  const estimatedCosts = tx.costItems.reduce(
    (sum, c) => sum + (c.estimatedUsd ? Number(c.estimatedUsd) : 0),
    0,
  );
  const estimatedAgentFee = grossValueUsd * AGENT_FEE_RATE;
  const estimatedCompanyFee = grossValueUsd * COMPANY_FEE_RATE;
  const estimatedNetRemittance =
    grossValueUsd - estimatedCosts - estimatedAgentFee - estimatedCompanyFee;

  return {
    transactionId: id,
    goldWeightFine,
    lmeSpotPrice: lmePrice.priceUsdPerTroyOz,
    grossValueUsd: Number(grossValueUsd.toFixed(2)),
    estimatedCosts: Number(estimatedCosts.toFixed(2)),
    estimatedAgentFee: Number(estimatedAgentFee.toFixed(2)),
    estimatedCompanyFee: Number(estimatedCompanyFee.toFixed(2)),
    estimatedNetRemittance: Number(estimatedNetRemittance.toFixed(2)),
    calculatedAt: new Date(),
    priceSource: lmePrice.source,
  };
}

// ---------------------------------------------------------------------------
// Phase advance
// ---------------------------------------------------------------------------

export async function advancePhase(
  id: string,
  dto: AdvancePhaseInput,
  actor: AuthenticatedUser,
): Promise<FullTransaction> {
  const tx = await loadFull(id);
  assertAccess(tx, actor);

  if (tx.phase === 'PHASE_7') {
    throw new ValidationError('Transaction is already in the final phase');
  }

  const gateCtx = await buildGateContext(tx);
  const { canAdvance, blockers } = checkPhaseGate(gateCtx);

  if (!canAdvance) {
    throw new ValidationError('Phase advance blocked by gate requirements', { blockers });
  }

  const { phase: nextPhase, status: nextStatus } = nextPhaseState(tx.phase, tx.status);
  const now = new Date();

  // Phase 6 sub-state: only update status, no phase change
  if (tx.phase === 'PHASE_6' && nextPhase === 'PHASE_6') {
    await prisma.transaction.update({
      where: { id },
      data: { status: nextStatus as TransactionStatus },
    });

    // Record as audit event
    void prisma.auditEvent
      .create({
        data: {
          entityType: 'TRANSACTION',
          entityId: id,
          action: 'STATUS_CHANGED',
          newValue: { from: tx.status, to: nextStatus, notes: dto.notes } as never,
          userId: actor.id,
        },
      })
      .catch((err) => logger.error({ err }, 'Audit event create failed'));

    return loadFull(id);
  }

  // Full phase transition
  const currentHistory = tx.phaseHistory.find(
    (ph) => ph.phase === tx.phase && ph.exitedAt === null,
  );

  const targetDays = SLA_TARGETS_DAYS[tx.phase] ?? 0;
  const slaBreach = currentHistory
    ? now.getTime() - currentHistory.enteredAt.getTime() > targetDays * 86_400_000
    : false;

  await prisma.$transaction(async (trx) => {
    if (currentHistory) {
      await trx.phaseHistory.update({
        where: { id: currentHistory.id },
        data: { exitedAt: now, slaBreach, notes: dto.notes },
      });
    }

    await trx.transaction.update({
      where: { id },
      data: {
        phase: nextPhase as TransactionPhase,
        status: nextStatus as TransactionStatus,
      },
    });

    await trx.phaseHistory.create({
      data: {
        transactionId: id,
        phase: nextPhase as TransactionPhase,
        enteredBy: actor.id,
      },
    });
  });

  logger.info(
    { transactionId: id, from: tx.phase, to: nextPhase, actor: actor.id },
    'Phase advanced',
  );
  return loadFull(id);
}

// ---------------------------------------------------------------------------
// Phase override (bypasses gate checks)
// ---------------------------------------------------------------------------

export async function overridePhase(
  id: string,
  dto: OverridePhaseInput,
  actor: AuthenticatedUser,
): Promise<FullTransaction> {
  const tx = await loadFull(id);
  assertAccess(tx, actor);

  let targetPhase: string;
  let targetStatus: string;

  if (dto.targetPhase) {
    targetPhase = dto.targetPhase;
    targetStatus = tx.status;
  } else {
    const next = nextPhaseState(tx.phase, tx.status);
    targetPhase = next.phase;
    targetStatus = next.status;
  }

  const now = new Date();
  const currentHistory = tx.phaseHistory.find(
    (ph) => ph.phase === tx.phase && ph.exitedAt === null,
  );

  await prisma.$transaction(async (trx) => {
    if (currentHistory) {
      await trx.phaseHistory.update({
        where: { id: currentHistory.id },
        data: { exitedAt: now, notes: `OVERRIDE: ${dto.reason}` },
      });
    }

    await trx.transaction.update({
      where: { id },
      data: {
        phase: targetPhase as TransactionPhase,
        status: targetStatus as TransactionStatus,
      },
    });

    if (targetPhase !== tx.phase) {
      await trx.phaseHistory.create({
        data: {
          transactionId: id,
          phase: targetPhase as TransactionPhase,
          enteredBy: actor.id,
          notes: `Phase override by ${actor.email}: ${dto.reason}`,
        },
      });
    }

    await trx.auditEvent.create({
      data: {
        entityType: 'TRANSACTION',
        entityId: id,
        action: 'PHASE_OVERRIDE',
        newValue: {
          from: tx.phase,
          to: targetPhase,
          reason: dto.reason,
          overriddenBy: actor.email,
        } as never,
        userId: actor.id,
      },
    });
  });

  logger.warn(
    { transactionId: id, from: tx.phase, to: targetPhase, actor: actor.id, reason: dto.reason },
    'Phase override applied',
  );
  return loadFull(id);
}

// ---------------------------------------------------------------------------
// Add event / comment
// ---------------------------------------------------------------------------

export async function addEvent(
  id: string,
  dto: AddEventInput,
  actor: AuthenticatedUser,
): Promise<{ id: string; action: string; data: unknown; timestamp: Date }> {
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: { agentId: true },
  });
  if (!tx) throw new NotFoundError('Transaction', id);
  assertAccess(tx, actor);

  const event = await prisma.auditEvent.create({
    data: {
      entityType: 'TRANSACTION',
      entityId: id,
      action: 'COMMENT',
      newValue: { text: dto.text, addedBy: actor.email } as never,
      userId: actor.id,
    },
  });

  return { id: event.id, action: event.action, data: event.newValue, timestamp: event.createdAt };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboard(actor: AuthenticatedUser) {
  const where: Prisma.TransactionWhereInput = agentScope(actor);

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      id: true,
      phase: true,
      status: true,
      countryCode: true,
      goldWeightGross: true,
      createdAt: true,
      client: { select: { fullName: true } },
      agent: { select: { companyName: true } },
      phaseHistory: {
        where: { exitedAt: null },
        orderBy: { enteredAt: 'desc' },
        take: 1,
      },
    },
  });

  const phases = ['PHASE_1', 'PHASE_2', 'PHASE_3', 'PHASE_4', 'PHASE_5', 'PHASE_6', 'PHASE_7'];

  const byPhase = phases.map((phase) => {
    const phaseTxs = transactions.filter((t) => t.phase === phase);

    const withRag = phaseTxs.map((t) => {
      const current = t.phaseHistory[0];
      const rag = current ? computeRag(phase, current.enteredAt) : ('GREEN' as const);
      return { ...t, rag };
    });

    return {
      phase,
      slaTargetDays: SLA_TARGETS_DAYS[phase],
      count: withRag.length,
      green: withRag.filter((t) => t.rag === 'GREEN').length,
      amber: withRag.filter((t) => t.rag === 'AMBER').length,
      red: withRag.filter((t) => t.rag === 'RED').length,
      transactions: withRag,
    };
  });

  const total = transactions.length;
  const green = byPhase.reduce((s, p) => s + p.green, 0);
  const amber = byPhase.reduce((s, p) => s + p.amber, 0);
  const red = byPhase.reduce((s, p) => s + p.red, 0);

  return { byPhase, totals: { total, green, amber, red } };
}
