/**
 * Unit tests for LME service functions.
 * Covers:
 *   - checkPriceAlertThreshold (pure)
 *   - getCurrentLmePrice (Redis → DB → fallback)
 */

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('@aop/utils', () => ({
  TROY_OZ_PER_GRAM: 31.1035,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@aop/db', () => ({
  prisma: {
    lmePriceRecord: { findFirst: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { checkPriceAlertThreshold } from '../modules/lme/lme-alert.service';
import { getCurrentLmePrice } from '../modules/lme/lme-feed.service';
import { redis } from '../lib/redis';
import { prisma } from '@aop/db';

const TROY_OZ_PER_GRAM = 31.1035;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const mockRedisGet = redis.get as jest.Mock;
const mockPrismaFindFirst = prisma.lmePriceRecord.findFirst as jest.Mock;

// ═══════════════════════════════════════════════════════════════════════════
// checkPriceAlertThreshold — pure function tests
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPriceAlertThreshold', () => {
  // ── Trigger scenarios ────────────────────────────────────────────────────

  describe('triggered = true', () => {
    it('triggers when price rises above threshold', () => {
      const result = checkPriceAlertThreshold({
        referencePrice: 2_000,
        currentPrice: 2_100, // +5% > threshold 4%
        thresholdPct: 4,
        goldWeightFineGrams: 1_000,
      });

      expect(result.triggered).toBe(true);
      expect(result.direction).toBe('UP');
      expect(result.changePct).toBeCloseTo(5, 5);
    });

    it('triggers when price falls below threshold', () => {
      const result = checkPriceAlertThreshold({
        referencePrice: 2_000,
        currentPrice: 1_900, // -5% => |changePct|=5 >= threshold 4
        thresholdPct: 4,
        goldWeightFineGrams: 1_000,
      });

      expect(result.triggered).toBe(true);
      expect(result.direction).toBe('DOWN');
      expect(result.changePct).toBeCloseTo(-5, 5);
    });

    it('triggers at exactly the threshold boundary', () => {
      const result = checkPriceAlertThreshold({
        referencePrice: 2_000,
        currentPrice: 2_080, // exactly +4%
        thresholdPct: 4,
        goldWeightFineGrams: 1_000,
      });

      expect(result.triggered).toBe(true); // >= not >
    });
  });

  // ── No-trigger scenarios ─────────────────────────────────────────────────

  describe('triggered = false', () => {
    it('does not trigger when change is below threshold', () => {
      const result = checkPriceAlertThreshold({
        referencePrice: 2_000,
        currentPrice: 2_050, // +2.5% < threshold 4%
        thresholdPct: 4,
        goldWeightFineGrams: 1_000,
      });

      expect(result.triggered).toBe(false);
      expect(result.changePct).toBeCloseTo(2.5, 5);
    });

    it('does not trigger when price is unchanged (FLAT)', () => {
      const result = checkPriceAlertThreshold({
        referencePrice: 2_350,
        currentPrice: 2_350,
        thresholdPct: 1,
        goldWeightFineGrams: 500,
      });

      expect(result.triggered).toBe(false);
      expect(result.direction).toBe('FLAT');
      expect(result.changePct).toBe(0);
    });
  });

  // ── exposureUsd calculation ───────────────────────────────────────────────

  describe('exposureUsd', () => {
    it('computes exposureUsd as (grams / TROY_OZ_PER_GRAM) × currentPrice', () => {
      const grams = 1_000;
      const currentPrice = 2_350;
      const result = checkPriceAlertThreshold({
        referencePrice: 2_000,
        currentPrice,
        thresholdPct: 5,
        goldWeightFineGrams: grams,
      });

      const expected = (grams / TROY_OZ_PER_GRAM) * currentPrice;
      expect(result.exposureUsd).toBeCloseTo(expected, 2);
    });

    it('computes exposureUsd for larger gold holdings', () => {
      // 2 kg = 2000 grams
      const grams = 2_000;
      const currentPrice = 2_400;
      const result = checkPriceAlertThreshold({
        referencePrice: 2_400,
        currentPrice,
        thresholdPct: 1,
        goldWeightFineGrams: grams,
      });

      const expectedTroyOz = grams / TROY_OZ_PER_GRAM;
      const expectedExposure = expectedTroyOz * currentPrice;
      expect(result.exposureUsd).toBeCloseTo(expectedExposure, 2);
    });

    it('returns zero exposure for zero gold weight', () => {
      const result = checkPriceAlertThreshold({
        referencePrice: 2_000,
        currentPrice: 2_200,
        thresholdPct: 5,
        goldWeightFineGrams: 0,
      });

      expect(result.exposureUsd).toBe(0);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns changePct = 0 when referencePrice is 0 (avoid divide-by-zero)', () => {
      const result = checkPriceAlertThreshold({
        referencePrice: 0,
        currentPrice: 2_000,
        thresholdPct: 1,
        goldWeightFineGrams: 100,
      });

      expect(result.changePct).toBe(0);
      expect(result.triggered).toBe(false);
    });

    it('direction UP for positive change', () => {
      const result = checkPriceAlertThreshold({
        referencePrice: 1_000,
        currentPrice: 1_100,
        thresholdPct: 20,
        goldWeightFineGrams: 100,
      });
      expect(result.direction).toBe('UP');
    });

    it('direction DOWN for negative change', () => {
      const result = checkPriceAlertThreshold({
        referencePrice: 1_000,
        currentPrice: 900,
        thresholdPct: 20,
        goldWeightFineGrams: 100,
      });
      expect(result.direction).toBe('DOWN');
    });
  });

  // ── Troy oz conversion consistency ───────────────────────────────────────

  describe('troy oz conversion', () => {
    it('1 kg (1000g) / TROY_OZ_PER_GRAM = 32.1507 troy oz approximately', () => {
      // 1000g / 31.1035 g/oz = 32.1507 oz (matches KG_TO_TROY_OZ constant)
      const grams = 1_000;
      const result = checkPriceAlertThreshold({
        referencePrice: 2_000,
        currentPrice: 2_000,
        thresholdPct: 5,
        goldWeightFineGrams: grams,
      });

      const troyOz = grams / TROY_OZ_PER_GRAM;
      expect(troyOz).toBeCloseTo(32.1507, 2);
      expect(result.exposureUsd).toBeCloseTo(troyOz * 2_000, 2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getCurrentLmePrice — Redis → DB → fallback
// ═══════════════════════════════════════════════════════════════════════════

describe('getCurrentLmePrice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Redis cache hit ───────────────────────────────────────────────────────

  describe('Redis cache hit', () => {
    it('returns cached price as fresh when cachedAt is within 5 minutes', async () => {
      const cachedData = {
        priceUsdPerKg: 75_554,
        priceType: 'SPOT',
        source: 'LBMA',
        recordedAt: new Date().toISOString(),
        cachedAt: new Date().toISOString(), // just cached
        stale: false,
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await getCurrentLmePrice();

      expect(result.priceUsdPerKg).toBe(75_554);
      expect(result.stale).toBe(false);
      expect(result.staleSince).toBeUndefined();
    });

    it('marks cached price as stale when cachedAt is older than 5 minutes', async () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const cachedData = {
        priceUsdPerKg: 73_947,
        priceType: 'SPOT',
        source: 'LBMA',
        recordedAt: sixMinutesAgo,
        cachedAt: sixMinutesAgo,
        stale: false,
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await getCurrentLmePrice();

      expect(result.stale).toBe(true);
      expect(result.staleSince).toBeDefined();
    });

    it('propagates stale=true from cached data even if within time window', async () => {
      const cachedData = {
        priceUsdPerKg: 73_947,
        priceType: 'SPOT',
        source: 'LBMA',
        recordedAt: new Date().toISOString(),
        cachedAt: new Date().toISOString(),
        stale: true, // already marked stale at cache time
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await getCurrentLmePrice();
      expect(result.stale).toBe(true);
    });
  });

  // ── Redis miss → DB fallback ──────────────────────────────────────────────

  describe('Redis miss → DB fallback', () => {
    it('returns DB price as fresh when recorded within 5 minutes', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      const freshRecordedAt = new Date(Date.now() - 2 * 60 * 1000); // 2 min ago
      mockPrismaFindFirst.mockResolvedValueOnce({
        priceUsdPerKg: 77_162,
        priceType: 'SPOT',
        source: 'LBMA',
        recordedAt: freshRecordedAt,
      });

      const result = await getCurrentLmePrice();

      expect(result.priceUsdPerKg).toBe(77_162);
      expect(result.stale).toBe(false);
    });

    it('returns DB price as stale when recorded more than 5 minutes ago', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      const oldRecordedAt = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
      mockPrismaFindFirst.mockResolvedValueOnce({
        priceUsdPerKg: 73_947,
        priceType: 'SPOT',
        source: 'LBMA',
        recordedAt: oldRecordedAt,
      });

      const result = await getCurrentLmePrice();

      expect(result.stale).toBe(true);
      expect(result.staleSince).toBeDefined();
    });
  });

  // ── Redis error → falls through to DB ────────────────────────────────────

  describe('Redis error → falls through to DB', () => {
    it('falls through to DB when Redis throws', async () => {
      mockRedisGet.mockRejectedValueOnce(new Error('Redis connection lost'));
      const recordedAt = new Date(Date.now() - 1 * 60 * 1000); // 1 min ago
      mockPrismaFindFirst.mockResolvedValueOnce({
        priceUsdPerKg: 76_519,
        priceType: 'SPOT',
        source: 'MANUAL',
        recordedAt,
      });

      const result = await getCurrentLmePrice();
      expect(result.priceUsdPerKg).toBe(76_519);
    });
  });

  // ── DB miss → hardcoded fallback ─────────────────────────────────────────

  describe('DB miss → hardcoded fallback', () => {
    it('returns 107_500 SPOT FALLBACK when Redis and DB both miss', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockPrismaFindFirst.mockResolvedValueOnce(null);

      const result = await getCurrentLmePrice();

      expect(result.priceUsdPerKg).toBe(107_500);
      expect(result.priceType).toBe('SPOT');
      expect(result.source).toBe('FALLBACK');
      expect(result.stale).toBe(true);
      expect(result.staleSince).toBeDefined();
    });
  });
});
