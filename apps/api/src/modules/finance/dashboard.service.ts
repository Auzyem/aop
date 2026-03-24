import { prisma } from '@aop/db';
import { NotFoundError, ForbiddenError } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import type { PortfolioPnlQuery } from './finance.schemas.js';

// ---------------------------------------------------------------------------
// P&L computation — pure function for testability
// ---------------------------------------------------------------------------

export interface SettledTxSummary {
  id: string;
  countryCode: string;
  agentId: string;
  agentName: string;
  settledMonth: string; // YYYY-MM
  grossProceedsUsd: number;
  totalDeductionsUsd: number;
  companyFeeUsd: number;
  netRemittanceUsd: number;
}

export interface PortfolioPnlResult {
  totalGrossProceedsUsd: number;
  totalCostsUsd: number;
  totalCompanyFeesUsd: number;
  totalNetCompanyProfitUsd: number;
  transactionCount: number;
  breakdownByCountry: Array<{
    countryCode: string;
    grossProceedsUsd: number;
    profitUsd: number;
    txCount: number;
  }>;
  breakdownByAgent: Array<{
    agentId: string;
    agentName: string;
    grossProceedsUsd: number;
    profitUsd: number;
    txCount: number;
  }>;
  breakdownByMonth: Array<{
    month: string;
    grossProceedsUsd: number;
    profitUsd: number;
    txCount: number;
  }>;
}

/**
 * Pure computation over pre-fetched settlement summaries.
 * No I/O — exported for unit testing.
 */
export function computePortfolioPnl(summaries: SettledTxSummary[]): PortfolioPnlResult {
  const totalGrossProceedsUsd = summaries.reduce((s, t) => s + t.grossProceedsUsd, 0);
  const totalCostsUsd = summaries.reduce((s, t) => s + t.totalDeductionsUsd, 0);
  const totalCompanyFeesUsd = summaries.reduce((s, t) => s + t.companyFeeUsd, 0);
  const totalNetCompanyProfitUsd = totalCompanyFeesUsd;

  // By country
  const byCountry = new Map<
    string,
    { grossProceedsUsd: number; profitUsd: number; txCount: number }
  >();
  for (const t of summaries) {
    const entry = byCountry.get(t.countryCode) ?? { grossProceedsUsd: 0, profitUsd: 0, txCount: 0 };
    entry.grossProceedsUsd += t.grossProceedsUsd;
    entry.profitUsd += t.companyFeeUsd;
    entry.txCount += 1;
    byCountry.set(t.countryCode, entry);
  }

  // By agent
  const byAgent = new Map<
    string,
    { agentName: string; grossProceedsUsd: number; profitUsd: number; txCount: number }
  >();
  for (const t of summaries) {
    const entry = byAgent.get(t.agentId) ?? {
      agentName: t.agentName,
      grossProceedsUsd: 0,
      profitUsd: 0,
      txCount: 0,
    };
    entry.grossProceedsUsd += t.grossProceedsUsd;
    entry.profitUsd += t.companyFeeUsd;
    entry.txCount += 1;
    byAgent.set(t.agentId, entry);
  }

  // By month
  const byMonth = new Map<
    string,
    { grossProceedsUsd: number; profitUsd: number; txCount: number }
  >();
  for (const t of summaries) {
    const entry = byMonth.get(t.settledMonth) ?? { grossProceedsUsd: 0, profitUsd: 0, txCount: 0 };
    entry.grossProceedsUsd += t.grossProceedsUsd;
    entry.profitUsd += t.companyFeeUsd;
    entry.txCount += 1;
    byMonth.set(t.settledMonth, entry);
  }

  return {
    totalGrossProceedsUsd,
    totalCostsUsd,
    totalCompanyFeesUsd,
    totalNetCompanyProfitUsd,
    transactionCount: summaries.length,
    breakdownByCountry: [...byCountry.entries()].map(([countryCode, v]) => ({ countryCode, ...v })),
    breakdownByAgent: [...byAgent.entries()].map(([agentId, v]) => ({ agentId, ...v })),
    breakdownByMonth: [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, ...v })),
  };
}

// ---------------------------------------------------------------------------
// Agent balance
// ---------------------------------------------------------------------------

export interface AgentBalanceItem {
  disbursementId: string;
  trancheNo: number;
  amountUsd: number;
  sentAt: Date | null;
  receiptStatus: string | null;
  isOverdue: boolean;
}

export async function getAgentBalance(agentId: string, actor: AuthenticatedUser) {
  // OPERATIONS agents can only view their own balance
  if (actor.role === 'OPERATIONS' && actor.agentId && actor.agentId !== agentId) {
    throw new ForbiddenError('You can only view your own agent balance');
  }

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new NotFoundError('Agent not found');

  const disbursements = await prisma.disbursement.findMany({
    where: { agentId, status: 'SENT' },
    include: { receipts: { orderBy: { uploadedAt: 'desc' }, take: 1 } },
    orderBy: { sentAt: 'asc' },
  });

  const now = Date.now();
  const OVERDUE_MS = 48 * 60 * 60 * 1000;

  let totalSentUsd = 0;
  let totalReconciledUsd = 0;
  const items: AgentBalanceItem[] = [];

  for (const d of disbursements) {
    const amount = Number(d.amountUsd);
    totalSentUsd += amount;

    const latestReceipt = d.receipts[0] ?? null;
    const receiptStatus = latestReceipt?.status ?? null;

    if (receiptStatus === 'APPROVED') {
      totalReconciledUsd += amount;
    }

    const isOverdue =
      receiptStatus !== 'APPROVED' && d.sentAt != null && now - d.sentAt.getTime() > OVERDUE_MS;

    items.push({
      disbursementId: d.id,
      trancheNo: d.trancheNo,
      amountUsd: amount,
      sentAt: d.sentAt,
      receiptStatus,
      isOverdue,
    });
  }

  return {
    agentId,
    agentName: agent.companyName,
    totalSentUsd,
    totalReconciledUsd,
    outstandingBalanceUsd: totalSentUsd - totalReconciledUsd,
    overdueCount: items.filter((i) => i.isOverdue).length,
    items,
  };
}

// ---------------------------------------------------------------------------
// Portfolio P&L
// ---------------------------------------------------------------------------

export async function getPortfolioPnl(query: PortfolioPnlQuery, _actor: AuthenticatedUser) {
  const where: Record<string, unknown> = {
    settlement: { isNot: null },
    status: 'SETTLED',
  };

  if (query.countryCode) where.countryCode = query.countryCode;
  if (query.agentId) where.agentId = query.agentId;

  const txns = await prisma.transaction.findMany({
    where,
    include: {
      settlement: true,
      agent: { select: { id: true, companyName: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Apply date filtering on settlement.approvedAt
  const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
  const dateTo = query.dateTo ? new Date(query.dateTo) : null;

  const summaries: SettledTxSummary[] = txns
    .filter((tx) => {
      if (!tx.settlement) return false;
      const settledAt = tx.settlement.approvedAt ?? tx.updatedAt;
      if (dateFrom && settledAt < dateFrom) return false;
      if (dateTo && settledAt > dateTo) return false;
      return true;
    })
    .map((tx) => {
      const s = tx.settlement!;
      const settledAt = s.approvedAt ?? tx.updatedAt;
      return {
        id: tx.id,
        countryCode: tx.countryCode,
        agentId: tx.agentId,
        agentName: tx.agent.companyName,
        settledMonth: settledAt.toISOString().slice(0, 7),
        grossProceedsUsd: Number(s.grossProceedsUsd),
        totalDeductionsUsd: Number(s.totalDeductionsUsd),
        companyFeeUsd: Number(s.companyFeeUsd),
        netRemittanceUsd: Number(s.netRemittanceUsd),
      };
    });

  return computePortfolioPnl(summaries);
}

// ---------------------------------------------------------------------------
// Active exposure
// ---------------------------------------------------------------------------

export async function getActiveExposure(_actor: AuthenticatedUser) {
  const txns = await prisma.transaction.findMany({
    where: {
      status: { notIn: ['SETTLED', 'CANCELLED'] },
    },
    include: {
      costItems: true,
      costEstimate: true,
      agent: { select: { id: true, companyName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return txns.map((tx) => {
    const totalEstimated = tx.costItems.reduce(
      (s, i) => s + (i.estimatedUsd ? Number(i.estimatedUsd) : 0),
      0,
    );
    const totalActual = tx.costItems.reduce(
      (s, i) => s + (i.actualUsd ? Number(i.actualUsd) : 0),
      0,
    );
    return {
      transactionId: tx.id,
      countryCode: tx.countryCode,
      phase: tx.phase,
      status: tx.status,
      agentId: tx.agentId,
      agentName: tx.agent.companyName,
      estimateStatus: tx.costEstimate?.status ?? 'NONE',
      totalEstimatedUsd: totalEstimated,
      totalActualUsd: totalActual,
      variance: totalActual - totalEstimated,
    };
  });
}
