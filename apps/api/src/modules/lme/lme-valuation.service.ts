import { prisma } from '@aop/db';
import { NotFoundError } from '@aop/utils';
import { COMPANY_FEE_DEFAULT } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import { getCurrentLmePrice } from './lme-feed.service.js';

// ---------------------------------------------------------------------------
// Pure valuation computation — exported for unit testing
// ---------------------------------------------------------------------------

export interface ValuationInput {
  /** Fine weight in grams */
  goldWeightFineGrams: number;
  /** LME spot or locked price in USD/kg */
  lmePricePerKg: number;
  /** Sum of all CostItem.estimatedUsd */
  totalEstimatedCostsUsd: number;
  /** Company fee as a fraction, e.g. 0.015 = 1.5% */
  companyFeeRate: number;
}

export interface ValuationResult {
  fineWeightGrams: number;
  fineWeightKg: number;
  lmePricePerKg: number;
  grossValueUsd: number;
  totalEstimatedCostsUsd: number;
  companyFeeUsd: number;
  estimatedNetUsd: number;
  priceSource: 'LOCKED' | 'LIVE';
}

/**
 * Pure computation — no I/O. Fine weight supplied in grams.
 * Exported for unit testing.
 */
export function computeValuation(input: ValuationInput): ValuationResult {
  const fineWeightKg = input.goldWeightFineGrams / 1000;
  const grossValueUsd = fineWeightKg * input.lmePricePerKg;
  const companyFeeUsd = grossValueUsd * input.companyFeeRate;
  const estimatedNetUsd = grossValueUsd - input.totalEstimatedCostsUsd - companyFeeUsd;

  return {
    fineWeightGrams: input.goldWeightFineGrams,
    fineWeightKg,
    lmePricePerKg: input.lmePricePerKg,
    grossValueUsd,
    totalEstimatedCostsUsd: input.totalEstimatedCostsUsd,
    companyFeeUsd,
    estimatedNetUsd,
    priceSource: 'LIVE', // caller overrides if locked
  };
}

// ---------------------------------------------------------------------------
// DB-backed valuation endpoint
// ---------------------------------------------------------------------------

export async function getTransactionValuation(txnId: string, _actor: AuthenticatedUser) {
  const tx = await prisma.transaction.findUnique({
    where: { id: txnId },
    include: {
      client: { select: { fullName: true, entityType: true } },
      agent: { select: { companyName: true } },
      costItems: true,
      settlement: true,
      refinery: { select: { name: true, refiningChargePercent: true, assayFeeUsd: true } },
    },
  });
  if (!tx) throw new NotFoundError('Transaction not found');

  // Determine price source
  let lmePricePerKg: number;
  let priceSource: 'LOCKED' | 'LIVE';
  let priceRecordedAt: string;

  if (tx.lmePriceLocked) {
    lmePricePerKg = Number(tx.lmePriceLocked);
    priceSource = 'LOCKED';
    priceRecordedAt = tx.priceLockedAt?.toISOString() ?? new Date().toISOString();
  } else {
    const live = await getCurrentLmePrice();
    lmePricePerKg = live.priceUsdPerKg;
    priceSource = 'LIVE';
    priceRecordedAt = live.recordedAt;
  }

  const fineGrams = tx.goldWeightFine ? Number(tx.goldWeightFine) : 0;
  const totalCosts = tx.costItems.reduce(
    (s, c) => s + (c.estimatedUsd ? Number(c.estimatedUsd) : 0),
    0,
  );

  // Company fee: use settlement if available, else default
  const companyFeeRate = tx.settlement
    ? Number(tx.settlement.companyFeePercent)
    : COMPANY_FEE_DEFAULT;

  const valuation = computeValuation({
    goldWeightFineGrams: fineGrams,
    lmePricePerKg,
    totalEstimatedCostsUsd: totalCosts,
    companyFeeRate,
  });

  return {
    ...valuation,
    priceSource,
    priceRecordedAt,
    transaction: {
      id: tx.id,
      clientName: tx.client.fullName,
      agentName: tx.agent.companyName,
      phase: tx.phase,
      goldWeightGrossGrams: Number(tx.goldWeightGross),
      assayPurity: tx.assayPurity ? Number(tx.assayPurity) : null,
    },
    refinery: tx.refinery
      ? {
          name: tx.refinery.name,
          refiningChargePercent: Number(tx.refinery.refiningChargePercent),
          assayFeeUsd: Number(tx.refinery.assayFeeUsd),
        }
      : null,
    costBreakdown: tx.costItems.map((c) => ({
      category: c.category,
      estimatedUsd: c.estimatedUsd ? Number(c.estimatedUsd) : null,
      actualUsd: c.actualUsd ? Number(c.actualUsd) : null,
    })),
  };
}
