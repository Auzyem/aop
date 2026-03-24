import { prisma } from '@aop/db';
import { logger } from '@aop/utils';

export interface LmePrice {
  priceUsdPerTroyOz: number;
  source: string;
  recordedAt: Date;
  priceType: string;
}

/** Conversion factor: 1 troy ounce = 31.1035 grams */
export const TROY_OZ_PER_GRAM = 31.1035;

/**
 * Returns the most recent gold spot price.
 * Priority: 1) DB (LmePriceRecord), 2) hardcoded fallback.
 * A future integration can populate LmePriceRecord via a scheduled job.
 */
export async function getCurrentPrice(): Promise<LmePrice> {
  const latest = await prisma.lmePriceRecord.findFirst({
    orderBy: { recordedAt: 'desc' },
  });

  if (latest) {
    return {
      priceUsdPerTroyOz: Number(latest.priceUsdPerTroyOz),
      source: latest.source,
      recordedAt: latest.recordedAt,
      priceType: latest.priceType,
    };
  }

  logger.warn('No LME price records in DB — using hardcoded fallback value');
  return {
    priceUsdPerTroyOz: 2_350,
    source: 'FALLBACK',
    recordedAt: new Date(),
    priceType: 'SPOT',
  };
}
