import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';
import { computeSettlement } from '../modules/settlement/settlement.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    transaction: { findUnique: jest.fn(), update: jest.fn() },
    settlement: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    document: { findMany: jest.fn() },
    disbursement: { findMany: jest.fn() },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') },
  setRefreshToken: jest.fn().mockResolvedValue(undefined),
  hasRefreshToken: jest.fn().mockResolvedValue(true),
  deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
  deleteAllUserTokens: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/s3', () => ({
  uploadToS3: jest.fn().mockResolvedValue({
    storageKey: 'settlements/s-1/statement.pdf',
    url: 'https://s3/statement.pdf',
  }),
  getSignedDownloadUrl: jest.fn().mockResolvedValue('https://s3/signed?token=abc'),
  s3Client: { send: jest.fn() },
}));

jest.mock('../lib/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/fx.service', () => ({
  ...jest.requireActual('../lib/fx.service'),
  getDailyRates: jest.fn().mockResolvedValue({
    base: 'USD',
    date: '2026-03-22',
    rates: { KES: 130, UGX: 3700, TZS: 2500, ZAR: 18.5 },
  }),
}));

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent: jest.fn().mockResolvedValue(undefined),
        pdf: jest.fn().mockResolvedValue(Buffer.from([37, 80, 68, 70])),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock('@aop/utils', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    statusCode = 403;
    code = 'FORBIDDEN';
    constructor(msg = 'Insufficient permissions') {
      super(msg);
      this.name = 'ForbiddenError';
    }
  },
  ValidationError: class ValidationError extends Error {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
  UnauthorizedError: class UnauthorizedError extends Error {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    constructor(msg = 'Authentication required') {
      super(msg);
      this.name = 'UnauthorizedError';
    }
  },
  ConflictError: class ConflictError extends Error {
    statusCode = 409;
    code = 'CONFLICT';
    constructor(msg: string) {
      super(msg);
      this.name = 'ConflictError';
    }
  },
  ExternalServiceError: class ExternalServiceError extends Error {
    statusCode = 502;
    code = 'EXTERNAL_SERVICE_ERROR';
    constructor(service: string, msg: string) {
      super(`[${service}]: ${msg}`);
      this.name = 'ExternalServiceError';
    }
  },
  isAppError: (e: unknown) => e instanceof Error && 'statusCode' in e,
  KG_TO_TROY_OZ: 32.1507,
  COMPANY_FEE_DEFAULT: 0.015,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMocks() {
  const db = jest.requireMock('@aop/db') as {
    prisma: {
      transaction: { findUnique: jest.Mock; update: jest.Mock };
      settlement: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock };
      document: { findMany: jest.Mock };
      disbursement: { findMany: jest.Mock };
    };
  };
  return { db };
}

function makeToken(role: string, userId = 'user-1'): string {
  jest.spyOn(jwtLib, 'verifyAccessToken').mockReturnValue({
    sub: userId,
    email: 'user@test.com',
    role,
    agentId: null,
    type: 'access',
    iat: 0,
    exp: 9999999999,
  } as unknown as ReturnType<typeof jwtLib.verifyAccessToken>);
  return 'Bearer mock-token';
}

const mockTransaction = {
  id: 'txn-1',
  clientId: 'client-1',
  agentId: 'agent-1',
  countryCode: 'KE',
  phase: 'PHASE_4',
  status: 'DOCS_APPROVED',
  goldWeightFine: 10, // treated as kg → 10 * 32.1507 = 321.507 troy oz
  goldWeightFineDestination: 9.95,
  assayDiscrepancyFlag: false,
  assayDiscrepancyPct: null,
  assayDiscrepancyNote: null,
  lmePriceLocked: 2000,
  priceLockedAt: new Date('2026-03-20T10:00:00Z'),
  priceLockedBy: 'user-1',
  client: { id: 'client-1', fullName: 'Test Miner Ltd', countryCode: 'KE' },
  agent: {
    id: 'agent-1',
    companyName: 'Agent Co',
    contactEmail: 'agent@test.com',
    bankName: 'KCB Bank',
    bankAccount: '1234567890',
    swiftBic: 'KCBLKENX',
  },
  costItems: [
    { id: 'cost-1', category: 'FREIGHT', estimatedUsd: 500, actualUsd: 450 },
    { id: 'cost-2', category: 'ASSAY_FEE', estimatedUsd: 300, actualUsd: null },
  ],
  disbursements: [{ id: 'disb-1', amountUsd: 1000, status: 'SENT' }],
  settlement: null,
};

const mockSettlement = {
  id: 's-1',
  transactionId: 'txn-1',
  grossProceedsUsd: 643014,
  actualCostsUsd: 750,
  agentFeeUsd: 1000,
  totalDeductionsUsd: 11395.21,
  companyFeeUsd: 9645.21,
  companyFeePercent: 0.015,
  netRemittanceUsd: 631618.79,
  lmePriceUsed: 2000,
  statementPdfUrl: null,
  remittanceInstructionUrl: null,
  calculatedAt: new Date(),
  notificationSentAt: null,
  approvedBy: null,
  approvedAt: null,
  remittanceStatus: 'PENDING',
  remittanceSentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  transaction: mockTransaction,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// UNIT TESTS: computeSettlement pure function
// ===========================================================================

describe('computeSettlement (pure function)', () => {
  const KG_TO_TROY_OZ = 32.1507;

  it('1. Normal case: standard costs, 1.5% company fee', () => {
    const result = computeSettlement({
      goldWeightFineKg: 10,
      lmePricePerTroyOz: 2000,
      costs: [
        { actualUsd: 450, estimatedUsd: 500 },
        { actualUsd: null, estimatedUsd: 300 },
      ],
      agentDisbursementsTotal: 1000,
      companyFeePercent: 0.015,
    });

    const expectedFineTroyOz = 10 * KG_TO_TROY_OZ;
    const expectedGross = expectedFineTroyOz * 2000;
    const expectedCosts = 450 + 300; // actual preferred, estimated fallback
    const expectedCompanyFee = expectedGross * 0.015;
    const expectedTotal = expectedCosts + 1000 + expectedCompanyFee;
    const expectedNet = expectedGross - expectedTotal;

    expect(result.fineTroyOz).toBeCloseTo(expectedFineTroyOz, 4);
    expect(result.grossProceedsUsd).toBeCloseTo(expectedGross, 2);
    expect(result.actualCostsUsd).toBe(expectedCosts);
    expect(result.agentFeeUsd).toBe(1000);
    expect(result.companyFeeUsd).toBeCloseTo(expectedCompanyFee, 4);
    expect(result.totalDeductionsUsd).toBeCloseTo(expectedTotal, 4);
    expect(result.netRemittanceUsd).toBeCloseTo(expectedNet, 4);
  });

  it('2. Zero costs: no cost items, no agent disbursements', () => {
    const result = computeSettlement({
      goldWeightFineKg: 5,
      lmePricePerTroyOz: 1800,
      costs: [],
      agentDisbursementsTotal: 0,
      companyFeePercent: 0.015,
    });

    const fineTroyOz = 5 * KG_TO_TROY_OZ;
    const gross = fineTroyOz * 1800;
    const companyFee = gross * 0.015;

    expect(result.actualCostsUsd).toBe(0);
    expect(result.agentFeeUsd).toBe(0);
    expect(result.companyFeeUsd).toBeCloseTo(companyFee, 4);
    expect(result.netRemittanceUsd).toBeCloseTo(gross - companyFee, 4);
  });

  it('3. Maximum fee percent (5%)', () => {
    const result = computeSettlement({
      goldWeightFineKg: 2,
      lmePricePerTroyOz: 2500,
      costs: [{ actualUsd: 200, estimatedUsd: 300 }],
      agentDisbursementsTotal: 500,
      companyFeePercent: 0.05,
    });

    const fineTroyOz = 2 * KG_TO_TROY_OZ;
    const gross = fineTroyOz * 2500;
    const companyFee = gross * 0.05;
    const total = 200 + 500 + companyFee;

    expect(result.companyFeeUsd).toBeCloseTo(companyFee, 4);
    expect(result.totalDeductionsUsd).toBeCloseTo(total, 4);
    expect(result.netRemittanceUsd).toBeCloseTo(gross - total, 4);
  });

  it('4. Very low net (< 10% of gross) — logs warning but does not throw', () => {
    // Massive deductions to push net below 10% of gross
    const result = computeSettlement({
      goldWeightFineKg: 1,
      lmePricePerTroyOz: 2000,
      costs: [{ actualUsd: 60000, estimatedUsd: 60000 }],
      agentDisbursementsTotal: 0,
      companyFeePercent: 0.015,
    });

    // Should still return a result (even if negative — validation done in service)
    expect(result.netRemittanceUsd).toBeLessThan(result.grossProceedsUsd * 0.1);
    // No throw
  });

  it('5. Actual costs preferred over estimated when both present', () => {
    const result = computeSettlement({
      goldWeightFineKg: 1,
      lmePricePerTroyOz: 1000,
      costs: [
        { actualUsd: 100, estimatedUsd: 200 }, // should use 100
        { actualUsd: null, estimatedUsd: 150 }, // should use 150
        { actualUsd: 0, estimatedUsd: 300 }, // should use 0 (actualUsd = 0 is not null)
      ],
      agentDisbursementsTotal: 0,
      companyFeePercent: 0.015,
    });

    expect(result.actualCostsUsd).toBe(100 + 150 + 0);
  });
});

// ===========================================================================
// UNIT TESTS: discrepancy detection (pure logic)
// ===========================================================================

describe('discrepancy detection (pure logic)', () => {
  it('calculates discrepancy percentage correctly', () => {
    const originWeight = 10;
    const destinationWeight = 9.95;
    const discrepancyPct = (Math.abs(originWeight - destinationWeight) / originWeight) * 100;
    expect(discrepancyPct).toBeCloseTo(0.5, 4);
  });

  it('returns 0% when weights are equal', () => {
    const originWeight = 5;
    const destinationWeight = 5;
    const discrepancyPct = (Math.abs(originWeight - destinationWeight) / originWeight) * 100;
    expect(discrepancyPct).toBe(0);
  });

  it('handles large discrepancy', () => {
    const originWeight = 10;
    const destinationWeight = 8;
    const discrepancyPct = (Math.abs(originWeight - destinationWeight) / originWeight) * 100;
    expect(discrepancyPct).toBe(20);
  });
});

// ===========================================================================
// HTTP INTEGRATION TESTS
// ===========================================================================

describe('GET /api/v1/settlements/transaction/:txnId', () => {
  it('returns settlement for authenticated user', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue(mockSettlement);

    const res = await request(app)
      .get('/api/v1/settlements/transaction/txn-1')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns null data when settlement does not exist (preview state)', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/settlements/transaction/txn-no-settlement')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/settlements/transaction/txn-1');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/settlements/transaction/:txnId/calculate', () => {
  it('calculates settlement successfully', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTransaction);
    db.prisma.document.findMany.mockResolvedValue([
      { documentType: 'ASSAY_CERTIFICATE' },
      { documentType: 'CUSTOMS_DECLARATION' },
      { documentType: 'CERTIFICATE_OF_ORIGIN' },
    ]);
    db.prisma.settlement.upsert.mockResolvedValue({ ...mockSettlement });

    const res = await request(app)
      .post('/api/v1/settlements/transaction/txn-1/calculate')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when lmePriceLocked is not set', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      ...mockTransaction,
      lmePriceLocked: null,
    });

    const res = await request(app)
      .post('/api/v1/settlements/transaction/txn-1/calculate')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when required documents are missing', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTransaction);
    db.prisma.document.findMany.mockResolvedValue([
      // Missing CUSTOMS_DECLARATION and CERTIFICATE_OF_ORIGIN
      { documentType: 'ASSAY_CERTIFICATE' },
    ]);

    const res = await request(app)
      .post('/api/v1/settlements/transaction/txn-1/calculate')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Missing approved documents/i);
  });

  it('returns 404 when transaction does not exist', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/settlements/transaction/txn-missing/calculate')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/settlements/:id/approve', () => {
  it('approves settlement successfully as TRADE_MANAGER', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue(mockSettlement);
    db.prisma.settlement.update.mockResolvedValue({
      ...mockSettlement,
      approvedBy: 'user-1',
      approvedAt: new Date(),
      statementPdfUrl: 'https://s3/statement.pdf',
    });
    db.prisma.transaction.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/v1/settlements/s-1/approve')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when VIEWER tries to approve settlement (RBAC)', async () => {
    const res = await request(app)
      .put('/api/v1/settlements/s-1/approve')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(403);
  });

  it('returns 403 when OPERATIONS tries to approve settlement (RBAC)', async () => {
    const res = await request(app)
      .put('/api/v1/settlements/s-1/approve')
      .set('Authorization', makeToken('OPERATIONS'));

    expect(res.status).toBe(403);
  });

  it('returns 409 when settlement already approved', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue({
      ...mockSettlement,
      approvedAt: new Date(),
      approvedBy: 'user-1',
    });

    const res = await request(app)
      .put('/api/v1/settlements/s-1/approve')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already approved/i);
  });

  it('returns 400 when assay discrepancy flag is set', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue({
      ...mockSettlement,
      transaction: {
        ...mockTransaction,
        assayDiscrepancyFlag: true,
      },
    });

    const res = await request(app)
      .put('/api/v1/settlements/s-1/approve')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/discrepancy/i);
  });

  it('returns 404 when settlement does not exist', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/settlements/s-missing/approve')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/settlements/:id/remittance-instruction', () => {
  it('generates remittance instruction for approved settlement', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue({
      ...mockSettlement,
      approvedAt: new Date(),
      approvedBy: 'user-1',
    });
    db.prisma.settlement.update.mockResolvedValue({
      ...mockSettlement,
      remittanceInstructionUrl: 'https://s3/remittance.pdf',
    });

    const res = await request(app)
      .post('/api/v1/settlements/s-1/remittance-instruction')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when settlement is not approved', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue({
      ...mockSettlement,
      approvedAt: null,
    });

    const res = await request(app)
      .post('/api/v1/settlements/s-1/remittance-instruction')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(400);
  });

  it('returns 403 for VIEWER role', async () => {
    const res = await request(app)
      .post('/api/v1/settlements/s-1/remittance-instruction')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/settlements/:id/status', () => {
  it('updates remittance status to SENT', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue(mockSettlement);
    db.prisma.settlement.update.mockResolvedValue({
      ...mockSettlement,
      remittanceStatus: 'SENT',
      remittanceSentAt: new Date(),
    });

    const res = await request(app)
      .put('/api/v1/settlements/s-1/status')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ status: 'SENT' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('updates remittance status to CONFIRMED', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue(mockSettlement);
    db.prisma.settlement.update.mockResolvedValue({
      ...mockSettlement,
      remittanceStatus: 'CONFIRMED',
    });

    const res = await request(app)
      .put('/api/v1/settlements/s-1/status')
      .set('Authorization', makeToken('SUPER_ADMIN'))
      .send({ status: 'CONFIRMED', bankRef: 'REF-12345' });

    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .put('/api/v1/settlements/s-1/status')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ status: 'INVALID_STATUS' });

    expect(res.status).toBe(400);
  });

  it('returns 403 for VIEWER role', async () => {
    const res = await request(app)
      .put('/api/v1/settlements/s-1/status')
      .set('Authorization', makeToken('VIEWER'))
      .send({ status: 'SENT' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/settlements/:id/notify-miner', () => {
  it('sends notification and returns success', async () => {
    const { db } = getMocks();
    db.prisma.settlement.findUnique.mockResolvedValue({
      ...mockSettlement,
      approvedAt: new Date(),
      statementPdfUrl: 'https://s3/statement.pdf',
    });
    db.prisma.settlement.update.mockResolvedValue({
      ...mockSettlement,
      notificationSentAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/settlements/s-1/notify-miner')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data.notified).toBe(true);
  });

  it('returns 403 for VIEWER role', async () => {
    const res = await request(app)
      .post('/api/v1/settlements/s-1/notify-miner')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/settlements/transaction/:txnId/clear-discrepancy', () => {
  it('clears discrepancy flag as OPERATIONS with a note', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      id: 'txn-1',
      assayDiscrepancyFlag: true,
    });
    db.prisma.transaction.update.mockResolvedValue({
      id: 'txn-1',
      assayDiscrepancyFlag: false,
      assayDiscrepancyNote: 'Minor variance within tolerance after re-assay',
    });

    const res = await request(app)
      .put('/api/v1/settlements/transaction/txn-1/clear-discrepancy')
      .set('Authorization', makeToken('OPERATIONS'))
      .send({ note: 'Minor variance within tolerance after re-assay' });

    expect(res.status).toBe(200);
    expect(res.body.data.assayDiscrepancyFlag).toBe(false);
    expect(res.body.data.assayDiscrepancyNote).toMatch(/tolerance/i);
  });

  it('returns 400 when no active discrepancy flag', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      id: 'txn-1',
      assayDiscrepancyFlag: false,
    });

    const res = await request(app)
      .put('/api/v1/settlements/transaction/txn-1/clear-discrepancy')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ note: 'Nothing to clear' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when note is missing', async () => {
    const res = await request(app)
      .put('/api/v1/settlements/transaction/txn-1/clear-discrepancy')
      .set('Authorization', makeToken('OPERATIONS'))
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 403 for VIEWER role', async () => {
    const res = await request(app)
      .put('/api/v1/settlements/transaction/txn-1/clear-discrepancy')
      .set('Authorization', makeToken('VIEWER'))
      .send({ note: 'test' });

    expect(res.status).toBe(403);
  });

  it('returns 404 when transaction not found', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/settlements/transaction/txn-missing/clear-discrepancy')
      .set('Authorization', makeToken('OPERATIONS'))
      .send({ note: 'test' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/settlements/discrepancy-check/:txnId', () => {
  it('returns discrepancy check when both weights present', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      goldWeightFine: 10,
      goldWeightFineDestination: 9.95,
      assayDiscrepancyFlag: false,
    });

    const res = await request(app)
      .get('/api/v1/settlements/discrepancy-check/txn-1')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(200);
    expect(res.body.data.checked).toBe(true);
    expect(res.body.data.discrepancyPct).toBeCloseTo(0.5, 2);
  });

  it('returns checked: false when no destination weight', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      goldWeightFine: 10,
      goldWeightFineDestination: null,
      assayDiscrepancyFlag: false,
    });

    const res = await request(app)
      .get('/api/v1/settlements/discrepancy-check/txn-1')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(200);
    expect(res.body.data.checked).toBe(false);
    expect(res.body.data.reason).toMatch(/No destination assay weight/i);
  });

  it('returns 404 when transaction not found', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/settlements/discrepancy-check/txn-missing')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(404);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/settlements/discrepancy-check/txn-1');
    expect(res.status).toBe(401);
  });
});
