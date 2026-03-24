import { TROY_OZ_PER_GRAM } from '@aop/utils';

// ---------------------------------------------------------------------------
// Pure alert threshold detection — exported for unit testing
// ---------------------------------------------------------------------------

export interface AlertCheckInput {
  referencePrice: number;
  currentPrice: number;
  thresholdPct: number;
  goldWeightFineGrams: number;
}

export interface AlertCheckResult {
  triggered: boolean;
  changePct: number;
  direction: 'UP' | 'DOWN' | 'FLAT';
  exposureUsd: number;
}

/**
 * Pure function — no I/O.
 * Computes whether a price change exceeds the alert threshold.
 */
export function checkPriceAlertThreshold(input: AlertCheckInput): AlertCheckResult {
  const { referencePrice, currentPrice, thresholdPct, goldWeightFineGrams } = input;

  const changePct =
    referencePrice !== 0 ? ((currentPrice - referencePrice) / referencePrice) * 100 : 0;

  const triggered = Math.abs(changePct) >= thresholdPct;
  const direction: AlertCheckResult['direction'] =
    changePct > 0 ? 'UP' : changePct < 0 ? 'DOWN' : 'FLAT';

  const fineWeightTroyOz = goldWeightFineGrams / TROY_OZ_PER_GRAM;
  const exposureUsd = fineWeightTroyOz * currentPrice;

  return { triggered, changePct, direction, exposureUsd };
}
