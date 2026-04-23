import { prisma } from '@aop/db';
import { logger } from '@aop/utils';

export interface LmePrice {
  priceUsdPerKg: number;
  source: string;
  recordedAt: Date;
  priceType: string;
}

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
      priceUsdPerKg: Number(latest.priceUsdPerKg),
      source: latest.source,
      recordedAt: latest.recordedAt,
      priceType: latest.priceType,
    };
  }

  logger.warn('No LME price records in DB — using hardcoded fallback value');
  return {
    priceUsdPerKg: 107_500,
    source: 'FALLBACK',
    recordedAt: new Date(),
    priceType: 'SPOT',
  };
}
