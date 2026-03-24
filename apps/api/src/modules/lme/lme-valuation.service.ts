import { prisma } from '@aop/db';
import { NotFoundError } from '@aop/utils';
import { TROY_OZ_PER_GRAM, COMPANY_FEE_DEFAULT } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import { getCurrentLmePrice } from './lme-feed.service.js';

// ---------------------------------------------------------------------------
// Pure valuation computation — exported for unit testing
// ---------------------------------------------------------------------------

export interface ValuationInput {
  /** Fine weight in grams */
  goldWeightFineGrams: number;
  /** LME spot or locked price in USD/troy oz */
  lmePricePerTroyOz: number;
  /** Sum of all CostItem.estimatedUsd */
  totalEstimatedCostsUsd: number;
  /** Company fee as a fraction, e.g. 0.015 = 1.5% */
  companyFeeRate: number;
}

export interface ValuationResult {
  fineWeightGrams: number;
  fineWeightTroyOz: number;
  lmePricePerTroyOz: number;
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
  const fineWeightTroyOz = input.goldWeightFineGrams / TROY_OZ_PER_GRAM;
  const grossValueUsd = fineWeightTroyOz * input.lmePricePerTroyOz;
  const companyFeeUsd = grossValueUsd * input.companyFeeRate;
  const estimatedNetUsd = grossValueUsd - input.totalEstimatedCostsUsd - companyFeeUsd;

  return {
    fineWeightGrams: input.goldWeightFineGrams,
    fineWeightTroyOz,
    lmePricePerTroyOz: input.lmePricePerTroyOz,
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
  let lmePricePerTroyOz: number;
  let priceSource: 'LOCKED' | 'LIVE';
  let priceRecordedAt: string;

  if (tx.lmePriceLocked) {
    lmePricePerTroyOz = Number(tx.lmePriceLocked);
    priceSource = 'LOCKED';
    priceRecordedAt = tx.priceLockedAt?.toISOString() ?? new Date().toISOString();
  } else {
    const live = await getCurrentLmePrice();
    lmePricePerTroyOz = live.priceUsdPerTroyOz;
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
    lmePricePerTroyOz,
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
