import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { redis } from '../../lib/redis.js';
import type { PriceHistoryQuery } from './lme.schemas.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LME_CACHE_KEY = 'lme:price:current';
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LivePrice {
  priceUsdPerTroyOz: number;
  priceType: string;
  source: string;
  recordedAt: string;
  stale: boolean;
  staleSince?: string;
  cachedAt?: string;
}

interface CachedPrice {
  priceUsdPerTroyOz: number;
  priceType: string;
  source: string;
  recordedAt: string;
  cachedAt: string;
  stale: boolean;
}

// ---------------------------------------------------------------------------
// Get current price (Redis → DB → fallback)
// ---------------------------------------------------------------------------

export async function getCurrentLmePrice(): Promise<LivePrice> {
  const now = new Date();

  // 1. Try Redis cache
  try {
    const cached = await redis.get(LME_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as CachedPrice;
      const ageMs = now.getTime() - new Date(data.cachedAt).getTime();
      const isStale = ageMs > STALE_THRESHOLD_MS || data.stale;
      return {
        ...data,
        stale: isStale,
        staleSince: isStale ? data.recordedAt : undefined,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Redis unavailable for LME cache read');
  }

  // 2. Fall back to DB
  const latest = await prisma.lmePriceRecord.findFirst({
    orderBy: { recordedAt: 'desc' },
  });

  if (latest) {
    const ageMs = now.getTime() - latest.recordedAt.getTime();
    const isStale = ageMs > STALE_THRESHOLD_MS;
    return {
      priceUsdPerTroyOz: Number(latest.priceUsdPerTroyOz),
      priceType: latest.priceType,
      source: latest.source,
      recordedAt: latest.recordedAt.toISOString(),
      stale: isStale,
      staleSince: isStale ? latest.recordedAt.toISOString() : undefined,
    };
  }

  // 3. Hardcoded fallback
  logger.warn('No LME price data available — returning hardcoded fallback');
  return {
    priceUsdPerTroyOz: 2_350,
    priceType: 'SPOT',
    source: 'FALLBACK',
    recordedAt: now.toISOString(),
    stale: true,
    staleSince: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Price history
// ---------------------------------------------------------------------------

export async function getPriceHistory(query: PriceHistoryQuery) {
  const where: Record<string, unknown> = {};

  if (query.priceType) where.priceType = query.priceType;

  if (query.dateFrom || query.dateTo) {
    const recordedAt: Record<string, Date> = {};
    if (query.dateFrom) recordedAt.gte = new Date(query.dateFrom);
    if (query.dateTo) recordedAt.lte = new Date(query.dateTo);
    where.recordedAt = recordedAt;
  }

  return prisma.lmePriceRecord.findMany({
    where,
    orderBy: { recordedAt: 'desc' },
    take: query.limit,
  });
}
