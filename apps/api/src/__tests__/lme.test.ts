import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';
import { checkPriceAlertThreshold } from '../modules/lme/lme-alert.service';
import { computeValuation } from '../modules/lme/lme-valuation.service';
import { PriceLockSchema, PriceHistoryQuerySchema } from '../modules/lme/lme.schemas';

// isMarketHours is defined in the worker package; replicate logic locally for unit testing
// Mon–Fri 06:00–16:30 London time (Europe/London handles GMT/BST automatically)
function isMarketHours(now: Date = new Date()): boolean {
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  if (utcDay === 0 || utcDay === 6) return false;

  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
  const londonMinutes = hour * 60 + minute;

  // LME trading session: 06:00–16:30 London time (inclusive)
  return londonMinutes >= 6 * 60 && londonMinutes <= 16 * 60 + 30;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    lmePriceRecord: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    refinery: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    priceAlert: {
      create: jest.fn().mockResolvedValue({ id: 'alert-1' }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  },
  setRefreshToken: jest.fn(),
  hasRefreshToken: jest.fn().mockResolvedValue(true),
  deleteRefreshToken: jest.fn(),
  deleteAllUserTokens: jest.fn(),
}));

jest.mock('../lib/s3', () => ({
  uploadToS3: jest
    .fn()
    .mockResolvedValue({ storageKey: 'lme/test.pdf', url: 'https://s3/test.pdf' }),
  getSignedDownloadUrl: jest.fn().mockResolvedValue('https://s3/signed'),
  s3Client: { send: jest.fn() },
}));

jest.mock('pdf-lib', () => ({
  PDFDocument: {
    create: jest.fn().mockResolvedValue({
      addPage: jest.fn().mockReturnValue({
        drawText: jest.fn(),
        drawLine: jest.fn(),
      }),
      embedFont: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    }),
  },
  StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'Helvetica-Bold' },
  rgb: jest.fn().mockReturnValue({}),
}));

jest.mock('@aop/utils', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    statusCode = 403;
    code = 'FORBIDDEN';
    constructor(m = '') {
      super(m);
      this.name = 'ForbiddenError';
    }
  },
  ValidationError: class ValidationError extends Error {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    constructor(m: string) {
      super(m);
      this.name = 'ValidationError';
    }
  },
  ConflictError: class ConflictError extends Error {
    statusCode = 409;
    code = 'CONFLICT';
    constructor(m: string) {
      super(m);
      this.name = 'ConflictError';
    }
  },
  UnauthorizedError: class UnauthorizedError extends Error {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    constructor(m = 'Authentication required') {
      super(m);
      this.name = 'UnauthorizedError';
    }
  },
  isAppError: (e: unknown) => e instanceof Error && 'statusCode' in e,
  TROY_OZ_PER_GRAM: 31.1035,
  KG_TO_TROY_OZ: 32.1507,
  COMPANY_FEE_DEFAULT: 0.015,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMocks() {
  const db = jest.requireMock('@aop/db') as {
    prisma: {
      lmePriceRecord: {
        findFirst: jest.Mock;
        findMany: jest.Mock;
        create: jest.Mock;
        upsert: jest.Mock;
      };
      transaction: {
        findUnique: jest.Mock;
        findMany: jest.Mock;
        update: jest.Mock;
      };
      document: { create: jest.Mock; findMany: jest.Mock };
      refinery: {
        findMany: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        findUnique: jest.Mock;
      };
      auditEvent: { create: jest.Mock };
      priceAlert: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    };
  };
  return { db };
}

function makeToken(role: string): string {
  jest.spyOn(jwtLib, 'verifyAccessToken').mockReturnValue({
    sub: 'user-1',
    email: 'admin@test.com',
    role,
    agentId: null,
    type: 'access',
    iat: 0,
    exp: 9999999999,
  } as unknown as ReturnType<typeof jwtLib.verifyAccessToken>);
  return 'Bearer mock-token';
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// UNIT TESTS: checkPriceAlertThreshold
// ===========================================================================

describe('checkPriceAlertThreshold (pure)', () => {
  const base = {
    thresholdPct: 2,
    goldWeightFineGrams: 100,
  };

  it('does not trigger when price rises 1.5% (below threshold)', () => {
    const result = checkPriceAlertThreshold({
      ...base,
      referencePrice: 2000,
      currentPrice: 2030, // +1.5%
    });
    expect(result.triggered).toBe(false);
    expect(result.direction).toBe('UP');
  });

  it('triggers with alertType direction RISE when price rises 2.5%', () => {
    const result = checkPriceAlertThreshold({
      ...base,
      referencePrice: 2000,
      currentPrice: 2050, // +2.5%
    });
    expect(result.triggered).toBe(true);
    expect(result.direction).toBe('UP');
    expect(result.changePct).toBeCloseTo(2.5, 5);
  });

  it('triggers with direction DOWN when price falls 3%', () => {
    const result = checkPriceAlertThreshold({
      ...base,
      referencePrice: 2000,
      currentPrice: 1940, // -3%
    });
    expect(result.triggered).toBe(true);
    expect(result.direction).toBe('DOWN');
    expect(result.changePct).toBeCloseTo(-3, 5);
  });

  it('returns not-triggered and changePct=0 when referencePrice is zero (no divide-by-zero)', () => {
    const result = checkPriceAlertThreshold({
      ...base,
      referencePrice: 0,
      currentPrice: 2000,
    });
    expect(result.triggered).toBe(false);
    expect(result.changePct).toBe(0);
    expect(result.direction).toBe('FLAT');
  });

  it('triggers when change is exactly at the threshold (2.0%)', () => {
    const result = checkPriceAlertThreshold({
      ...base,
      referencePrice: 2000,
      currentPrice: 2040, // exactly +2.0%
    });
    expect(result.triggered).toBe(true);
    expect(result.changePct).toBeCloseTo(2.0, 5);
  });

  it('computes exposureUsd correctly', () => {
    const TROY_OZ_PER_GRAM = 31.1035;
    const result = checkPriceAlertThreshold({
      ...base,
      referencePrice: 2000,
      currentPrice: 2500,
      goldWeightFineGrams: 100,
    });
    // 100g / 31.1035 * 2500
    const expected = (100 / TROY_OZ_PER_GRAM) * 2500;
    expect(result.exposureUsd).toBeCloseTo(expected, 2);
  });
});

// ===========================================================================
// UNIT TESTS: computeValuation
// ===========================================================================

describe('computeValuation (pure)', () => {
  it('standard: 10 kg fine gold @ $80_000/kg', () => {
    const fineGrams = 10000;
    const pricePerKg = 80_000;
    const companyFeeRate = 0.015;
    const totalCosts = 500;

    const result = computeValuation({
      goldWeightFineGrams: fineGrams,
      lmePricePerKg: pricePerKg,
      totalEstimatedCostsUsd: totalCosts,
      companyFeeRate,
    });

    const expectedFineWeightKg = fineGrams / 1000;
    const expectedGross = expectedFineWeightKg * pricePerKg;
    const expectedFee = expectedGross * companyFeeRate;
    const expectedNet = expectedGross - totalCosts - expectedFee;

    expect(result.fineWeightGrams).toBe(fineGrams);
    expect(result.fineWeightKg).toBeCloseTo(expectedFineWeightKg, 4);
    expect(result.grossValueUsd).toBeCloseTo(expectedGross, 2);
    expect(result.companyFeeUsd).toBeCloseTo(expectedFee, 2);
    expect(result.estimatedNetUsd).toBeCloseTo(expectedNet, 2);
    expect(result.totalEstimatedCostsUsd).toBe(totalCosts);
  });

  it('zero costs: net = gross - companyFee', () => {
    const fineGrams = 31.1035; // ≈ 1 troy oz = 0.031 kg
    const pricePerKg = 64_302; // ≈ $2000/toz
    const companyFeeRate = 0.01;

    const result = computeValuation({
      goldWeightFineGrams: fineGrams,
      lmePricePerKg: pricePerKg,
      totalEstimatedCostsUsd: 0,
      companyFeeRate,
    });

    const fineWeightKg = fineGrams / 1000;
    const gross = fineWeightKg * pricePerKg;
    const fee = gross * companyFeeRate;
    expect(result.grossValueUsd).toBeCloseTo(gross, 2);
    expect(result.estimatedNetUsd).toBeCloseTo(gross - fee, 2);
  });

  it('high refinery charge (0.5% as companyFeeRate) deducts correctly', () => {
    const fineGrams = 100;
    const pricePerKg = 96_000; // ≈ $3000/toz
    const highFeeRate = 0.005;
    const totalCosts = 0;

    const result = computeValuation({
      goldWeightFineGrams: fineGrams,
      lmePricePerKg: pricePerKg,
      totalEstimatedCostsUsd: totalCosts,
      companyFeeRate: highFeeRate,
    });

    const gross = (fineGrams / 1000) * pricePerKg;
    expect(result.companyFeeUsd).toBeCloseTo(gross * highFeeRate, 4);
  });

  it('refinery tariff + assay fee combined via totalEstimatedCostsUsd', () => {
    const fineGrams = 200;
    const pricePerKg = 77_162; // ≈ $2400/toz
    const refiningTariff = 150;
    const assayFee = 75;
    const totalCosts = refiningTariff + assayFee; // 225

    const result = computeValuation({
      goldWeightFineGrams: fineGrams,
      lmePricePerKg: pricePerKg,
      totalEstimatedCostsUsd: totalCosts,
      companyFeeRate: 0.015,
    });

    expect(result.totalEstimatedCostsUsd).toBe(225);
    const gross = (fineGrams / 1000) * pricePerKg;
    const fee = gross * 0.015;
    expect(result.estimatedNetUsd).toBeCloseTo(gross - 225 - fee, 2);
  });

  it('very small weight (1 g) — no arithmetic errors', () => {
    const result = computeValuation({
      goldWeightFineGrams: 1,
      lmePricePerKg: 80_000,
      totalEstimatedCostsUsd: 0,
      companyFeeRate: 0.015,
    });

    expect(result.fineWeightKg).toBeCloseTo(1 / 1000, 6);
    expect(result.grossValueUsd).toBeGreaterThan(0);
    expect(isFinite(result.estimatedNetUsd)).toBe(true);
  });
});

// ===========================================================================
// UNIT TESTS: isMarketHours
// ===========================================================================

describe('isMarketHours (pure) — 06:00–16:30 London time', () => {
  // January dates = GMT (no BST), so London time == UTC

  it('Monday 09:00 UTC → true (09:00 London GMT, within 06:00–16:30)', () => {
    expect(isMarketHours(new Date('2025-01-06T09:00:00Z'))).toBe(true);
  });

  it('Monday 05:59 UTC → false (05:59 London GMT, before 06:00 open)', () => {
    expect(isMarketHours(new Date('2025-01-06T05:59:00Z'))).toBe(false);
  });

  it('Monday 06:00 UTC → true (exactly at open, London GMT)', () => {
    expect(isMarketHours(new Date('2025-01-06T06:00:00Z'))).toBe(true);
  });

  it('Friday 16:30 UTC → true (exactly at close, London GMT)', () => {
    expect(isMarketHours(new Date('2025-01-10T16:30:00Z'))).toBe(true);
  });

  it('Friday 16:31 UTC → false (after 16:30 close, London GMT)', () => {
    expect(isMarketHours(new Date('2025-01-10T16:31:00Z'))).toBe(false);
  });

  it('Saturday 10:00 UTC → false (weekend)', () => {
    expect(isMarketHours(new Date('2025-01-11T10:00:00Z'))).toBe(false);
  });

  it('Wednesday 12:30 UTC → true (midday midweek, London GMT)', () => {
    expect(isMarketHours(new Date('2025-01-08T12:30:00Z'))).toBe(true);
  });

  // June dates = BST (UTC+1), so London time = UTC + 1 hour
  it('Monday 05:00 UTC in BST → true (06:00 London BST, exactly at open)', () => {
    // 2025-06-02 is a Monday in summer — BST active
    expect(isMarketHours(new Date('2025-06-02T05:00:00Z'))).toBe(true);
  });

  it('Monday 04:59 UTC in BST → false (05:59 London BST, before open)', () => {
    expect(isMarketHours(new Date('2025-06-02T04:59:00Z'))).toBe(false);
  });

  it('Friday 15:30 UTC in BST → true (16:30 London BST, exactly at close)', () => {
    // 2025-06-06 is a Friday in summer
    expect(isMarketHours(new Date('2025-06-06T15:30:00Z'))).toBe(true);
  });

  it('Friday 15:31 UTC in BST → false (16:31 London BST, after close)', () => {
    expect(isMarketHours(new Date('2025-06-06T15:31:00Z'))).toBe(false);
  });
});

// ===========================================================================
// UNIT TESTS: PriceLockSchema — FORWARD price type
// ===========================================================================

describe('PriceLockSchema — FORWARD price type', () => {
  it('accepts SPOT, AM_FIX, PM_FIX, FORWARD as valid priceType values', () => {
    for (const priceType of ['SPOT', 'AM_FIX', 'PM_FIX', 'FORWARD'] as const) {
      const result = PriceLockSchema.safeParse({ priceType, lockedPrice: 2450.5 });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown priceType values', () => {
    const result = PriceLockSchema.safeParse({ priceType: 'DAILY_FIX', lockedPrice: 2450.5 });
    expect(result.success).toBe(false);
  });
});

describe('PriceHistoryQuerySchema — FORWARD price type', () => {
  it('accepts FORWARD as priceType query param', () => {
    const result = PriceHistoryQuerySchema.safeParse({ priceType: 'FORWARD', limit: '50' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown priceType in history query', () => {
    const result = PriceHistoryQuerySchema.safeParse({ priceType: 'INVALID_TYPE' });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// HTTP INTEGRATION TESTS
// ===========================================================================

const mockPriceRecord = {
  id: 'price-1',
  priceUsdPerKg: 78_783,
  priceType: 'SPOT',
  source: 'METALS_DEV',
  recordedAt: new Date('2026-03-22T10:00:00Z'),
};

const mockRefinery = {
  id: 'ref-1',
  name: 'Rand Refinery',
  countryCode: 'ZA',
  lbmaAccredited: true,
  contactEmail: 'info@rand.co.za',
  refiningChargePercent: 0.003,
  assayFeeUsd: 50,
};

const mockTransaction = {
  id: 'txn-1',
  phase: 'PHASE_3',
  status: 'IN_TRANSIT',
  lmePriceLocked: null,
  priceLockedAt: null,
  priceLockedBy: null,
  goldWeightFine: '320.5',
  goldWeightGross: '350',
  assayPurity: '0.9167',
  client: { fullName: 'Test Miner', entityType: 'INDIVIDUAL' },
  agent: { companyName: 'Test Agent Co' },
  costItems: [{ estimatedUsd: '500', actualUsd: null, category: 'FREIGHT' }],
  settlement: null,
  refinery: {
    name: 'Rand Refinery',
    refiningChargePercent: '0.003',
    assayFeeUsd: '50',
  },
};

// ---------------------------------------------------------------------------
// GET /api/v1/lme/price/current
// ---------------------------------------------------------------------------

describe('GET /api/v1/lme/price/current', () => {
  it('returns current price from DB when Redis returns null', async () => {
    const { db } = getMocks();
    db.prisma.lmePriceRecord.findFirst.mockResolvedValue(mockPriceRecord);

    const res = await request(app)
      .get('/api/v1/lme/price/current')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      priceUsdPerKg: 78_783,
      priceType: 'SPOT',
      source: 'METALS_DEV',
    });
  });

  it('returns hardcoded fallback when no DB records exist', async () => {
    const { db } = getMocks();
    db.prisma.lmePriceRecord.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/lme/price/current')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'FALLBACK' });
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lme/price/history
// ---------------------------------------------------------------------------

describe('GET /api/v1/lme/price/history', () => {
  it('returns price history with query params', async () => {
    const { db } = getMocks();
    db.prisma.lmePriceRecord.findMany.mockResolvedValue([mockPriceRecord]);

    const res = await request(app)
      .get('/api/v1/lme/price/history')
      .query({ dateFrom: '2026-03-01', dateTo: '2026-03-22' })
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(db.prisma.lmePriceRecord.findMany).toHaveBeenCalled();
  });

  it('returns 400 for invalid priceType query param', async () => {
    const res = await request(app)
      .get('/api/v1/lme/price/history')
      .query({ priceType: 'INVALID_TYPE' })
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/lme/price/lock/:txnId
// ---------------------------------------------------------------------------

describe('POST /api/v1/lme/price/lock/:txnId', () => {
  const lockBody = { priceType: 'SPOT', lockedPrice: 2450.5 };

  it('TRADE_MANAGER can lock price (200)', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      ...mockTransaction,
      lmePriceLocked: null,
    });
    db.prisma.lmePriceRecord.findFirst.mockResolvedValue(mockPriceRecord);
    db.prisma.document.create.mockResolvedValue({ id: 'doc-1' });
    db.prisma.transaction.update.mockResolvedValue({
      ...mockTransaction,
      lmePriceLocked: 2450.5,
      client: { id: 'client-1', fullName: 'Test Miner' },
      agent: { id: 'agent-1', companyName: 'Test Agent Co' },
    });

    const res = await request(app)
      .post('/api/v1/lme/price/lock/txn-1')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send(lockBody);

    expect(res.status).toBe(200);
  });

  it('VIEWER cannot lock price (403)', async () => {
    const res = await request(app)
      .post('/api/v1/lme/price/lock/txn-1')
      .set('Authorization', makeToken('VIEWER'))
      .send(lockBody);

    expect(res.status).toBe(403);
  });

  it('TRADE_MANAGER can lock with FORWARD price type (200)', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      ...mockTransaction,
      lmePriceLocked: null,
    });
    db.prisma.lmePriceRecord.findFirst.mockResolvedValue(mockPriceRecord);
    db.prisma.document.create.mockResolvedValue({ id: 'doc-1' });
    db.prisma.transaction.update.mockResolvedValue({
      ...mockTransaction,
      lmePriceLocked: 2500,
      client: { id: 'client-1', fullName: 'Test Miner' },
      agent: { id: 'agent-1', companyName: 'Test Agent Co' },
    });

    const res = await request(app)
      .post('/api/v1/lme/price/lock/txn-1')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ priceType: 'FORWARD', lockedPrice: 2500 });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lme/refineries
// ---------------------------------------------------------------------------

describe('GET /api/v1/lme/refineries', () => {
  it('returns list of refineries', async () => {
    const { db } = getMocks();
    db.prisma.refinery.findMany.mockResolvedValue([mockRefinery]);

    const res = await request(app)
      .get('/api/v1/lme/refineries')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toMatchObject({ name: 'Rand Refinery' });
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/lme/refineries
// ---------------------------------------------------------------------------

describe('POST /api/v1/lme/refineries', () => {
  const newRefinery = {
    name: 'New Refinery',
    countryCode: 'KE',
    lbmaAccredited: false,
    refiningChargePercent: 0.5,
    assayFeeUsd: 75,
  };

  it('ADMIN creates refinery (201)', async () => {
    const { db } = getMocks();
    db.prisma.refinery.create.mockResolvedValue({ id: 'ref-2', ...newRefinery });

    const res = await request(app)
      .post('/api/v1/lme/refineries')
      .set('Authorization', makeToken('ADMIN'))
      .send(newRefinery);

    expect(res.status).toBe(201);
    expect(db.prisma.refinery.create).toHaveBeenCalled();
  });

  it('VIEWER cannot create refinery (403)', async () => {
    const res = await request(app)
      .post('/api/v1/lme/refineries')
      .set('Authorization', makeToken('VIEWER'))
      .send(newRefinery);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/lme/refineries/:id
// ---------------------------------------------------------------------------

describe('PUT /api/v1/lme/refineries/:id', () => {
  it('ADMIN updates refinery', async () => {
    const { db } = getMocks();
    db.prisma.refinery.findUnique.mockResolvedValue(mockRefinery);
    db.prisma.refinery.update.mockResolvedValue({
      ...mockRefinery,
      name: 'Updated Refinery',
    });

    const res = await request(app)
      .put('/api/v1/lme/refineries/ref-1')
      .set('Authorization', makeToken('ADMIN'))
      .send({ name: 'Updated Refinery' });

    expect(res.status).toBe(200);
    expect(db.prisma.refinery.update).toHaveBeenCalled();
  });

  it('VIEWER cannot update refinery (403)', async () => {
    const res = await request(app)
      .put('/api/v1/lme/refineries/ref-1')
      .set('Authorization', makeToken('VIEWER'))
      .send({ name: 'Should Fail' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lme/dashboard
// ---------------------------------------------------------------------------

describe('GET /api/v1/lme/dashboard', () => {
  it('TRADE_MANAGER can access dashboard', async () => {
    const { db } = getMocks();
    db.prisma.lmePriceRecord.findFirst.mockResolvedValue(mockPriceRecord);
    db.prisma.transaction.findMany.mockResolvedValue([]);
    db.prisma.lmePriceRecord.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/lme/dashboard')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('currentPrices');
    expect(res.body.data).toHaveProperty('activeTransactions');
  });

  it('VIEWER cannot access dashboard (403)', async () => {
    const res = await request(app)
      .get('/api/v1/lme/dashboard')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lme/valuation/:txnId
// ---------------------------------------------------------------------------

describe('GET /api/v1/lme/valuation/:txnId', () => {
  it('returns valuation for a transaction', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      ...mockTransaction,
      lmePriceLocked: null,
    });
    db.prisma.lmePriceRecord.findFirst.mockResolvedValue(mockPriceRecord);

    const res = await request(app)
      .get('/api/v1/lme/valuation/txn-1')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('grossValueUsd');
    expect(res.body.data).toHaveProperty('estimatedNetUsd');
    expect(res.body.data).toHaveProperty('priceSource');
    expect(res.body.data).toHaveProperty('transaction');
  });

  it('returns valuation using locked price when available', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      ...mockTransaction,
      lmePriceLocked: '2450.5',
      priceLockedAt: new Date('2026-03-22T10:00:00Z'),
    });

    const res = await request(app)
      .get('/api/v1/lme/valuation/txn-1')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data.priceSource).toBe('LOCKED');
  });

  it('returns 404 when transaction not found', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/lme/valuation/nonexistent-txn')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lme/alerts
// ---------------------------------------------------------------------------

describe('GET /api/v1/lme/alerts', () => {
  it('returns empty array when no alerts', async () => {
    const { db } = getMocks();
    db.prisma.priceAlert.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/lme/alerts')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('maps alert fields correctly', async () => {
    const { db } = getMocks();
    db.prisma.priceAlert.findMany.mockResolvedValue([
      {
        id: 'alert-1',
        transactionId: 'txn-1',
        referencePriceUsd: '2400.00',
        newPriceUsd: '2450.00',
        changePct: '2.08',
        direction: 'UP',
        alertedAt: new Date('2026-04-20T10:00:00Z'),
      },
    ]);

    const res = await request(app)
      .get('/api/v1/lme/alerts')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 'alert-1',
      transactionId: 'txn-1',
      originalPrice: 2400,
      currentPrice: 2450,
      direction: 'UP',
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lme/transactions/awaiting-lock
// ---------------------------------------------------------------------------

describe('GET /api/v1/lme/transactions/awaiting-lock', () => {
  it('returns transactions with unlocked price', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'txn-1',
        phase: 'PHASE_2',
        createdAt: new Date('2026-04-01T00:00:00Z'),
        goldWeightFine: '10.5',
        goldWeightGross: '11.0',
        client: { fullName: 'Test Client' },
      },
    ]);

    const res = await request(app)
      .get('/api/v1/lme/transactions/awaiting-lock')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 'txn-1',
      phase: 'PHASE_2',
      goldWeightFine: 10.5,
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/lme/refinery/pipeline
// ---------------------------------------------------------------------------

describe('GET /api/v1/lme/refinery/pipeline', () => {
  it('returns phase 4 and 5 transactions', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'txn-2',
        phase: 'PHASE_4',
        status: 'ACTIVE',
        goldWeightFine: '8.0',
        client: { fullName: 'Refinery Client' },
        refinery: { name: 'Gold Refinery Ltd' },
      },
    ]);

    const res = await request(app)
      .get('/api/v1/lme/refinery/pipeline')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 'txn-2',
      phase: 'PHASE_4',
      deliveryStatus: 'ACTIVE',
      refineryName: 'Gold Refinery Ltd',
    });
  });
});
