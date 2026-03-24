import { prisma } from '@aop/db';
import type { CostCategory } from '@aop/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import { convertToUsd } from '../../lib/fx.service.js';
import type { AddCostItemDto, UpdateCostItemDto, RejectEstimateDto } from './finance.schemas.js';

// Approval threshold — configurable via env var, defaults to $10,000
export const FINANCE_APPROVAL_THRESHOLD_USD = Number(
  process.env.FINANCE_APPROVAL_THRESHOLD_USD ?? 10_000,
);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadTransaction(txnId: string) {
  const tx = await prisma.transaction.findUnique({ where: { id: txnId } });
  if (!tx) throw new NotFoundError('Transaction not found');
  return tx;
}

async function upsertEstimate(txnId: string) {
  const totalAgg = await prisma.costItem.aggregate({
    where: { transactionId: txnId },
    _sum: { estimatedUsd: true, actualUsd: true },
  });

  return prisma.costEstimate.upsert({
    where: { transactionId: txnId },
    update: {
      totalEstimatedUsd: totalAgg._sum.estimatedUsd ?? 0,
      totalActualUsd: totalAgg._sum.actualUsd ?? 0,
    },
    create: {
      transactionId: txnId,
      totalEstimatedUsd: totalAgg._sum.estimatedUsd ?? 0,
      totalActualUsd: totalAgg._sum.actualUsd ?? 0,
    },
  });
}

// ---------------------------------------------------------------------------
// Cost Items
// ---------------------------------------------------------------------------

export async function getCostItems(txnId: string, _actor: AuthenticatedUser) {
  await loadTransaction(txnId);
  return prisma.costItem.findMany({
    where: { transactionId: txnId },
    orderBy: { category: 'asc' },
  });
}

export async function addCostItem(txnId: string, dto: AddCostItemDto, _actor: AuthenticatedUser) {
  await loadTransaction(txnId);

  // Check estimate is not locked
  const estimate = await prisma.costEstimate.findUnique({ where: { transactionId: txnId } });
  if (estimate?.status === 'SUBMITTED' || estimate?.status === 'APPROVED') {
    throw new ValidationError(`Cost estimate is ${estimate.status} — cannot modify items`);
  }

  // FX conversion for original-currency amounts
  let fxRate: number | undefined;
  let estimatedUsd = dto.estimatedUsd;
  const actualUsd = dto.actualUsd;

  if (dto.currencyOriginal && dto.amountOriginal) {
    const converted = await convertToUsd(dto.amountOriginal, dto.currencyOriginal);
    fxRate = converted.fxRate;
    // Auto-fill estimatedUsd if not provided
    if (!estimatedUsd) estimatedUsd = converted.amountUsd;
  }

  const item = await prisma.costItem.create({
    data: {
      transactionId: txnId,
      category: dto.category as CostCategory,
      estimatedUsd,
      actualUsd,
      currencyOriginal: dto.currencyOriginal,
      amountOriginal: dto.amountOriginal,
      fxRate,
      notes: dto.notes,
    },
  });

  // Keep estimate totals in sync
  await upsertEstimate(txnId);

  return item;
}

export async function updateCostItem(
  txnId: string,
  itemId: string,
  dto: UpdateCostItemDto,
  _actor: AuthenticatedUser,
) {
  const item = await prisma.costItem.findUnique({ where: { id: itemId } });
  if (!item || item.transactionId !== txnId) throw new NotFoundError('Cost item not found');

  const estimate = await prisma.costEstimate.findUnique({ where: { transactionId: txnId } });
  if (estimate?.status === 'SUBMITTED' || estimate?.status === 'APPROVED') {
    throw new ValidationError(`Cost estimate is ${estimate.status} — cannot modify items`);
  }

  let fxRate = item.fxRate ? Number(item.fxRate) : undefined;
  let estimatedUsd = dto.estimatedUsd;

  if (dto.currencyOriginal && dto.amountOriginal) {
    const converted = await convertToUsd(dto.amountOriginal, dto.currencyOriginal);
    fxRate = converted.fxRate;
    if (!estimatedUsd) estimatedUsd = converted.amountUsd;
  }

  const updated = await prisma.costItem.update({
    where: { id: itemId },
    data: {
      ...(dto.category ? { category: dto.category as CostCategory } : {}),
      ...(estimatedUsd != null ? { estimatedUsd } : {}),
      ...(dto.actualUsd != null ? { actualUsd: dto.actualUsd } : {}),
      ...(dto.currencyOriginal ? { currencyOriginal: dto.currencyOriginal } : {}),
      ...(dto.amountOriginal != null ? { amountOriginal: dto.amountOriginal } : {}),
      ...(fxRate != null ? { fxRate } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    },
  });

  await upsertEstimate(txnId);
  return updated;
}

// ---------------------------------------------------------------------------
// Cost Estimate workflow
// ---------------------------------------------------------------------------

export async function getCostEstimate(txnId: string, _actor: AuthenticatedUser) {
  await loadTransaction(txnId);

  const [items, estimate] = await Promise.all([
    prisma.costItem.findMany({ where: { transactionId: txnId } }),
    prisma.costEstimate.findUnique({
      where: { transactionId: txnId },
      include: {
        submittedByUser: { select: { id: true, email: true } },
        approvedByUser: { select: { id: true, email: true } },
        rejectedByUser: { select: { id: true, email: true } },
      },
    }),
  ]);

  const totalEstimatedUsd = items.reduce(
    (s, i) => s + (i.estimatedUsd ? Number(i.estimatedUsd) : 0),
    0,
  );
  const totalActualUsd = items.reduce((s, i) => s + (i.actualUsd ? Number(i.actualUsd) : 0), 0);

  return {
    estimate: estimate ?? {
      transactionId: txnId,
      status: 'DRAFT',
      totalEstimatedUsd: 0,
      totalActualUsd: 0,
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
    },
    totalEstimatedUsd,
    totalActualUsd,
    itemCount: items.length,
    requiresCeoApproval: totalEstimatedUsd >= FINANCE_APPROVAL_THRESHOLD_USD,
  };
}

export async function submitEstimate(txnId: string, actor: AuthenticatedUser) {
  await loadTransaction(txnId);

  const itemCount = await prisma.costItem.count({ where: { transactionId: txnId } });
  if (itemCount === 0) throw new ValidationError('No cost items to submit');

  const estimate = await upsertEstimate(txnId);
  if (estimate.status === 'APPROVED') {
    throw new ValidationError('Cost estimate is already approved');
  }
  if (estimate.status === 'SUBMITTED') {
    throw new ValidationError('Cost estimate already submitted — awaiting approval');
  }

  return prisma.costEstimate.update({
    where: { transactionId: txnId },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      submittedBy: actor.id,
      // Clear prior rejection markers on resubmission
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
    },
  });
}

export async function approveEstimate(txnId: string, actor: AuthenticatedUser) {
  await loadTransaction(txnId);

  const estimate = await prisma.costEstimate.findUnique({ where: { transactionId: txnId } });
  if (!estimate) throw new NotFoundError('Cost estimate not found — submit first');
  if (estimate.status !== 'SUBMITTED') {
    throw new ValidationError(`Cannot approve estimate in ${estimate.status} state`);
  }

  const total = Number(estimate.totalEstimatedUsd);

  // Threshold check: >= $10k requires SUPER_ADMIN (CEO)
  if (total >= FINANCE_APPROVAL_THRESHOLD_USD && actor.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError(
      `Estimates >= $${FINANCE_APPROVAL_THRESHOLD_USD.toLocaleString()} require CEO approval`,
    );
  }

  // Below threshold: TRADE_MANAGER or SUPER_ADMIN
  if (!['TRADE_MANAGER', 'SUPER_ADMIN'].includes(actor.role)) {
    throw new ForbiddenError('Only Finance or CEO can approve cost estimates');
  }

  return prisma.costEstimate.update({
    where: { transactionId: txnId },
    data: {
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedBy: actor.id,
    },
  });
}

export async function rejectEstimate(
  txnId: string,
  dto: RejectEstimateDto,
  actor: AuthenticatedUser,
) {
  await loadTransaction(txnId);

  const estimate = await prisma.costEstimate.findUnique({ where: { transactionId: txnId } });
  if (!estimate) throw new NotFoundError('Cost estimate not found');
  if (estimate.status !== 'SUBMITTED') {
    throw new ValidationError(`Cannot reject estimate in ${estimate.status} state`);
  }

  if (!['TRADE_MANAGER', 'SUPER_ADMIN'].includes(actor.role)) {
    throw new ForbiddenError('Only Finance or CEO can reject cost estimates');
  }

  // Transition to DRAFT so items can be revised
  return prisma.costEstimate.update({
    where: { transactionId: txnId },
    data: {
      status: 'DRAFT',
      rejectedAt: new Date(),
      rejectedBy: actor.id,
      rejectionReason: dto.reason,
    },
  });
}
