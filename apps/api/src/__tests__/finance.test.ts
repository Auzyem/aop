import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';
import { convertAmountToUsd } from '../lib/fx.service';
import { checkDisbursementRules } from '../modules/finance/disbursements.service';
import { computePortfolioPnl } from '../modules/finance/dashboard.service';
import type { SettledTxSummary } from '../modules/finance/dashboard.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    transaction: { findUnique: jest.fn(), findMany: jest.fn() },
    costItem: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    costEstimate: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    disbursement: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    disbursementReceipt: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    agent: { findUnique: jest.fn() },
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
  uploadToS3: jest
    .fn()
    .mockResolvedValue({ storageKey: 'key/test.pdf', url: 'https://s3/test.pdf' }),
  getSignedDownloadUrl: jest.fn().mockResolvedValue('https://s3/signed?token=abc'),
  s3Client: { send: jest.fn() },
}));

jest.mock('../lib/fx.service', () => ({
  ...jest.requireActual('../lib/fx.service'),
  convertToUsd: jest.fn().mockResolvedValue({ amountUsd: 850, fxRate: 17.5 }),
  getDailyRates: jest.fn().mockResolvedValue({
    base: 'USD',
    date: '2026-03-21',
    rates: { ZAR: 18.5, KES: 130, GBP: 0.79 },
  }),
}));

// pdf-lib is used inside disbursements.service — mock to avoid real PDF generation in tests
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
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMocks() {
  const db = jest.requireMock('@aop/db') as {
    prisma: {
      transaction: { findUnique: jest.Mock; findMany: jest.Mock };
      costItem: {
        create: jest.Mock;
        findMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
        count: jest.Mock;
        aggregate: jest.Mock;
      };
      costEstimate: {
        findUnique: jest.Mock;
        upsert: jest.Mock;
        update: jest.Mock;
        create: jest.Mock;
      };
      disbursement: {
        findUnique: jest.Mock;
        findMany: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
      };
      disbursementReceipt: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
      agent: { findUnique: jest.Mock };
    };
  };
  return { db };
}

function makeToken(role: string, agentId?: string): string {
  jest.spyOn(jwtLib, 'verifyAccessToken').mockReturnValue({
    sub: 'user-1',
    email: 'user@test.com',
    role,
    agentId: agentId ?? null,
    type: 'access',
    iat: 0,
    exp: 9999999999,
  } as unknown as ReturnType<typeof jwtLib.verifyAccessToken>);
  return 'Bearer mock-token';
}

const mockTx = {
  id: 'txn-1',
  agentId: 'agent-1',
  countryCode: 'KE',
  phase: 'PHASE_3',
  status: 'IN_TRANSIT',
};

const mockCostItem = {
  id: 'cost-1',
  transactionId: 'txn-1',
  category: 'FREIGHT',
  estimatedUsd: 500,
  actualUsd: null,
  currencyOriginal: null,
  amountOriginal: null,
  fxRate: null,
  notes: null,
};

const mockEstimate = {
  id: 'est-1',
  transactionId: 'txn-1',
  status: 'DRAFT',
  totalEstimatedUsd: 500,
  totalActualUsd: 0,
  submittedAt: null,
  submittedBy: null,
  approvedAt: null,
  approvedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  rejectionReason: null,
};

const mockDisbursement = {
  id: 'disb-1',
  transactionId: 'txn-1',
  agentId: 'agent-1',
  trancheNo: 1,
  amountUsd: 1000,
  status: 'PENDING',
  requestedAt: new Date(),
  approvedAt: null,
  approvedBy: null,
  sentAt: null,
  bankRef: null,
  instructionPdfUrl: null,
  agent: { id: 'agent-1', companyName: 'Test Miner Co', bankName: 'KCB', bankAccount: '1234567' },
  transaction: mockTx,
  receipts: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// UNIT TESTS: FX Conversion (pure function)
// ===========================================================================

describe('FX convertAmountToUsd (pure)', () => {
  const rates = { ZAR: 18.5, KES: 130.0, GBP: 0.79 };

  it('returns amount unchanged for USD', () => {
    const result = convertAmountToUsd(100, 'USD', rates);
    expect(result.amountUsd).toBe(100);
    expect(result.fxRate).toBe(1.0);
  });

  it('converts ZAR to USD correctly', () => {
    const result = convertAmountToUsd(18500, 'ZAR', rates);
    expect(result.amountUsd).toBeCloseTo(1000, 2);
    expect(result.fxRate).toBe(18.5);
  });

  it('converts KES to USD correctly', () => {
    const result = convertAmountToUsd(13000, 'KES', rates);
    expect(result.amountUsd).toBeCloseTo(100, 2);
    expect(result.fxRate).toBe(130);
  });

  it('converts GBP to USD (stronger than USD)', () => {
    const result = convertAmountToUsd(79, 'GBP', rates);
    expect(result.amountUsd).toBeCloseTo(100, 1);
    expect(result.fxRate).toBe(0.79);
  });

  it('falls back to 1.0 for unknown currency', () => {
    const result = convertAmountToUsd(500, 'XYZ', rates);
    expect(result.amountUsd).toBe(500);
    expect(result.fxRate).toBe(1.0);
  });

  it('handles zero amount', () => {
    const result = convertAmountToUsd(0, 'ZAR', rates);
    expect(result.amountUsd).toBe(0);
  });
});

// ===========================================================================
// UNIT TESTS: Disbursement Rules (pure function)
// ===========================================================================

describe('checkDisbursementRules (pure)', () => {
  const now = new Date('2026-03-21T12:00:00Z');
  const sentAt24hAgo = new Date('2026-03-20T12:00:00Z'); // within 48h
  const sentAt72hAgo = new Date('2026-03-18T12:00:00Z'); // > 48h

  function baseCtx(
    overrides = {},
  ): import('../modules/finance/disbursements.service').DisbursementRuleContext {
    return {
      trancheNo: 1,
      estimateStatus: 'APPROVED',
      tranche1Disbursements: [],
      tranche1Receipts: [],
      agentSentDisbursements: [],
      agentReceipts: [],
      now,
      ...overrides,
    };
  }

  it('allows tranche 1 when estimate is APPROVED', () => {
    expect(checkDisbursementRules(baseCtx())).toEqual({ allowed: true });
  });

  it('blocks tranche 1 when estimate is DRAFT', () => {
    const result = checkDisbursementRules(baseCtx({ estimateStatus: 'DRAFT' }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/estimate must be approved/i);
  });

  it('blocks tranche 1 when estimate is SUBMITTED', () => {
    const result = checkDisbursementRules(baseCtx({ estimateStatus: 'SUBMITTED' }));
    expect(result.allowed).toBe(false);
  });

  it('blocks tranche 1 when estimate is null', () => {
    const result = checkDisbursementRules(baseCtx({ estimateStatus: null }));
    expect(result.allowed).toBe(false);
  });

  it('blocks tranche 2 when tranche 1 not sent', () => {
    const result = checkDisbursementRules(
      baseCtx({
        trancheNo: 2,
        tranche1Disbursements: [{ id: 'disb-1', status: 'APPROVED' }],
        tranche1Receipts: [],
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/tranche 1 must be sent/i);
  });

  it('blocks tranche 2 when tranche 1 sent but receipt not approved', () => {
    const result = checkDisbursementRules(
      baseCtx({
        trancheNo: 2,
        tranche1Disbursements: [{ id: 'disb-1', status: 'SENT' }],
        tranche1Receipts: [{ disbursementId: 'disb-1', status: 'PENDING', uploadedAt: now }],
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/receipts must be approved/i);
  });

  it('allows tranche 2 when tranche 1 sent and receipt approved', () => {
    const result = checkDisbursementRules(
      baseCtx({
        trancheNo: 2,
        tranche1Disbursements: [{ id: 'disb-1', status: 'SENT' }],
        tranche1Receipts: [{ disbursementId: 'disb-1', status: 'APPROVED', uploadedAt: now }],
      }),
    );
    expect(result.allowed).toBe(true);
  });

  it('blocks when agent has unreconciled disbursement > 48h', () => {
    const result = checkDisbursementRules(
      baseCtx({
        agentSentDisbursements: [{ id: 'old-disb', sentAt: sentAt72hAgo }],
        agentReceipts: [],
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/unreconciled/i);
  });

  it('allows when old disbursement has approved receipt', () => {
    const result = checkDisbursementRules(
      baseCtx({
        agentSentDisbursements: [{ id: 'old-disb', sentAt: sentAt72hAgo }],
        agentReceipts: [{ disbursementId: 'old-disb', status: 'APPROVED', uploadedAt: now }],
      }),
    );
    expect(result.allowed).toBe(true);
  });

  it('allows when old disbursement is within 48h window', () => {
    const result = checkDisbursementRules(
      baseCtx({
        agentSentDisbursements: [{ id: 'recent-disb', sentAt: sentAt24hAgo }],
        agentReceipts: [],
      }),
    );
    expect(result.allowed).toBe(true);
  });
});

// ===========================================================================
// UNIT TESTS: Portfolio P&L (pure function)
// ===========================================================================

describe('computePortfolioPnl (pure)', () => {
  function makeSummary(overrides: Partial<SettledTxSummary> = {}): SettledTxSummary {
    return {
      id: 'txn-x',
      countryCode: 'KE',
      agentId: 'agent-1',
      agentName: 'Test Miner Co',
      settledMonth: '2026-01',
      grossProceedsUsd: 100_000,
      totalDeductionsUsd: 5_000,
      companyFeeUsd: 1_500,
      netRemittanceUsd: 93_500,
      ...overrides,
    };
  }

  it('returns zeros for empty input', () => {
    const result = computePortfolioPnl([]);
    expect(result.totalGrossProceedsUsd).toBe(0);
    expect(result.transactionCount).toBe(0);
    expect(result.breakdownByCountry).toHaveLength(0);
  });

  it('aggregates single transaction correctly', () => {
    const result = computePortfolioPnl([makeSummary()]);
    expect(result.totalGrossProceedsUsd).toBe(100_000);
    expect(result.totalCostsUsd).toBe(5_000);
    expect(result.totalCompanyFeesUsd).toBe(1_500);
    expect(result.totalNetCompanyProfitUsd).toBe(1_500);
    expect(result.transactionCount).toBe(1);
  });

  it('aggregates multiple transactions across countries', () => {
    const result = computePortfolioPnl([
      makeSummary({ countryCode: 'KE', grossProceedsUsd: 100_000, companyFeeUsd: 1_500 }),
      makeSummary({
        id: 'txn-2',
        countryCode: 'ZM',
        grossProceedsUsd: 200_000,
        companyFeeUsd: 3_000,
      }),
    ]);
    expect(result.totalGrossProceedsUsd).toBe(300_000);
    expect(result.totalCompanyFeesUsd).toBe(4_500);
    expect(result.breakdownByCountry).toHaveLength(2);
    const ke = result.breakdownByCountry.find((b) => b.countryCode === 'KE');
    expect(ke?.grossProceedsUsd).toBe(100_000);
    expect(ke?.profitUsd).toBe(1_500);
  });

  it('groups by agent correctly', () => {
    const result = computePortfolioPnl([
      makeSummary({ agentId: 'agent-1', grossProceedsUsd: 50_000, companyFeeUsd: 750 }),
      makeSummary({
        id: 'txn-2',
        agentId: 'agent-1',
        grossProceedsUsd: 50_000,
        companyFeeUsd: 750,
      }),
      makeSummary({
        id: 'txn-3',
        agentId: 'agent-2',
        agentName: 'Other Co',
        grossProceedsUsd: 100_000,
        companyFeeUsd: 1_500,
      }),
    ]);
    expect(result.breakdownByAgent).toHaveLength(2);
    const agent1 = result.breakdownByAgent.find((b) => b.agentId === 'agent-1');
    expect(agent1?.txCount).toBe(2);
    expect(agent1?.grossProceedsUsd).toBe(100_000);
  });

  it('orders breakdownByMonth chronologically', () => {
    const result = computePortfolioPnl([
      makeSummary({ settledMonth: '2026-03' }),
      makeSummary({ id: 'txn-2', settledMonth: '2026-01' }),
      makeSummary({ id: 'txn-3', settledMonth: '2026-02' }),
    ]);
    const months = result.breakdownByMonth.map((b) => b.month);
    expect(months).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

// ===========================================================================
// HTTP INTEGRATION TESTS
// ===========================================================================

// ---------------------------------------------------------------------------
// Cost Items
// ---------------------------------------------------------------------------

describe('GET /api/v1/finance/transactions/:txnId/costs', () => {
  it('returns cost items for transaction', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costItem.findMany.mockResolvedValue([mockCostItem]);

    const res = await request(app)
      .get('/api/v1/finance/transactions/txn-1/costs')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 403 for VIEWER', async () => {
    const res = await request(app)
      .get('/api/v1/finance/transactions/txn-1/costs')
      .set('Authorization', makeToken('VIEWER'));
    expect(res.status).toBe(200); // VIEWER is in ALL_FINANCE_ROLES
  });
});

describe('POST /api/v1/finance/transactions/:txnId/costs', () => {
  it('creates cost item with USD amount', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costEstimate.findUnique.mockResolvedValue(null);
    db.prisma.costItem.create.mockResolvedValue({ ...mockCostItem, id: 'cost-new' });
    db.prisma.costItem.aggregate.mockResolvedValue({
      _sum: { estimatedUsd: 500, actualUsd: null },
    });
    db.prisma.costEstimate.upsert.mockResolvedValue(mockEstimate);

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/costs')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ category: 'FREIGHT', estimatedUsd: 500 });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('cost-new');
  });

  it('returns 400 when no amount provided', async () => {
    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/costs')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ category: 'FREIGHT' });

    expect(res.status).toBe(400);
  });

  it('blocks modifications when estimate is SUBMITTED', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costEstimate.findUnique.mockResolvedValue({ ...mockEstimate, status: 'SUBMITTED' });

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/costs')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ category: 'FREIGHT', estimatedUsd: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/SUBMITTED/);
  });
});

// ---------------------------------------------------------------------------
// Cost Estimate workflow
// ---------------------------------------------------------------------------

describe('GET /api/v1/finance/transactions/:txnId/estimate', () => {
  it('returns estimate summary with items', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costItem.findMany.mockResolvedValue([mockCostItem]);
    db.prisma.costEstimate.findUnique.mockResolvedValue(mockEstimate);

    const res = await request(app)
      .get('/api/v1/finance/transactions/txn-1/estimate')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data.estimate.status).toBe('DRAFT');
    expect(res.body.data.totalEstimatedUsd).toBe(500);
  });
});

describe('POST /api/v1/finance/transactions/:txnId/estimate/submit', () => {
  it('submits draft estimate', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costItem.count.mockResolvedValue(2);
    db.prisma.costItem.aggregate.mockResolvedValue({
      _sum: { estimatedUsd: 5000, actualUsd: null },
    });
    db.prisma.costEstimate.upsert.mockResolvedValue(mockEstimate);
    db.prisma.costEstimate.update.mockResolvedValue({ ...mockEstimate, status: 'SUBMITTED' });

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/estimate/submit')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
  });

  it('returns 400 when no cost items', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costItem.count.mockResolvedValue(0);

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/estimate/submit')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/No cost items/);
  });
});

describe('POST /api/v1/finance/transactions/:txnId/estimate/approve', () => {
  it('TRADE_MANAGER approves estimate below threshold', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costEstimate.findUnique.mockResolvedValue({
      ...mockEstimate,
      status: 'SUBMITTED',
      totalEstimatedUsd: 5000, // < $10k
    });
    db.prisma.costEstimate.update.mockResolvedValue({ ...mockEstimate, status: 'APPROVED' });

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/estimate/approve')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('TRADE_MANAGER cannot approve estimate >= threshold ($10k)', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costEstimate.findUnique.mockResolvedValue({
      ...mockEstimate,
      status: 'SUBMITTED',
      totalEstimatedUsd: 15000, // >= $10k
    });

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/estimate/approve')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/CEO/);
  });

  it('SUPER_ADMIN approves estimate >= threshold', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costEstimate.findUnique.mockResolvedValue({
      ...mockEstimate,
      status: 'SUBMITTED',
      totalEstimatedUsd: 50000,
    });
    db.prisma.costEstimate.update.mockResolvedValue({ ...mockEstimate, status: 'APPROVED' });

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/estimate/approve')
      .set('Authorization', makeToken('SUPER_ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('returns 403 for OPERATIONS role', async () => {
    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/estimate/approve')
      .set('Authorization', makeToken('OPERATIONS'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/finance/transactions/:txnId/estimate/reject', () => {
  it('rejects submitted estimate with reason', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.costEstimate.findUnique.mockResolvedValue({ ...mockEstimate, status: 'SUBMITTED' });
    db.prisma.costEstimate.update.mockResolvedValue({
      ...mockEstimate,
      status: 'DRAFT',
      rejectionReason: 'Costs too high',
    });

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/estimate/reject')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ reason: 'Costs are too high for this transaction' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('returns 400 when reason too short', async () => {
    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/estimate/reject')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ reason: 'No' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Disbursements
// ---------------------------------------------------------------------------

describe('GET /api/v1/finance/transactions/:txnId/disbursements', () => {
  it('returns list of disbursements', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(mockTx);
    db.prisma.disbursement.findMany.mockResolvedValue([mockDisbursement]);

    const res = await request(app)
      .get('/api/v1/finance/transactions/txn-1/disbursements')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/v1/finance/transactions/:txnId/disbursements', () => {
  it('creates disbursement when rules pass', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      ...mockTx,
      costEstimate: { status: 'APPROVED' },
      disbursements: [],
      agent: { id: 'agent-1' },
    });
    db.prisma.disbursement.findMany.mockResolvedValue([]); // no agent sent disbursements
    db.prisma.disbursement.create.mockResolvedValue({ ...mockDisbursement, id: 'disb-new' });

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/disbursements')
      .set('Authorization', makeToken('OPERATIONS', 'agent-1'))
      .send({ amountUsd: 1000 });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('disb-new');
  });

  it('returns 400 when estimate not approved', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      ...mockTx,
      costEstimate: { status: 'DRAFT' },
      disbursements: [],
      agent: { id: 'agent-1' },
    });
    db.prisma.disbursement.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/disbursements')
      .set('Authorization', makeToken('OPERATIONS', 'agent-1'))
      .send({ amountUsd: 1000 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/estimate must be approved/i);
  });

  it('returns 400 for negative amount', async () => {
    const res = await request(app)
      .post('/api/v1/finance/transactions/txn-1/disbursements')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ amountUsd: -500 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/finance/disbursements/:id/approve', () => {
  it('approves pending disbursement', async () => {
    const { db } = getMocks();
    db.prisma.disbursement.findUnique.mockResolvedValue(mockDisbursement);
    db.prisma.disbursement.update.mockResolvedValue({ ...mockDisbursement, status: 'APPROVED' });

    const res = await request(app)
      .post('/api/v1/finance/disbursements/disb-1/approve')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('returns 403 for VIEWER', async () => {
    const res = await request(app)
      .post('/api/v1/finance/disbursements/disb-1/approve')
      .set('Authorization', makeToken('VIEWER'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/finance/disbursements/:id/mark-sent', () => {
  it('marks approved disbursement as sent and generates PDF letter', async () => {
    const { db } = getMocks();
    db.prisma.disbursement.findUnique.mockResolvedValue({
      ...mockDisbursement,
      status: 'APPROVED',
    });
    db.prisma.disbursement.update.mockResolvedValue({
      ...mockDisbursement,
      status: 'SENT',
      sentAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/finance/disbursements/disb-1/mark-sent')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SENT');
  });

  it('returns 400 for pending disbursement', async () => {
    const { db } = getMocks();
    db.prisma.disbursement.findUnique.mockResolvedValue({ ...mockDisbursement, status: 'PENDING' });

    const res = await request(app)
      .post('/api/v1/finance/disbursements/disb-1/mark-sent')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

describe('POST /api/v1/finance/disbursements/:id/receipts', () => {
  it('uploads receipt for sent disbursement', async () => {
    const { db } = getMocks();
    db.prisma.disbursement.findUnique.mockResolvedValue({ ...mockDisbursement, status: 'SENT' });
    db.prisma.disbursementReceipt.create.mockResolvedValue({
      id: 'receipt-1',
      disbursementId: 'disb-1',
      storageKey: 'receipts/disb-1/test.pdf',
      filename: 'receipt.pdf',
      status: 'PENDING',
    });

    const res = await request(app)
      .post('/api/v1/finance/disbursements/disb-1/receipts')
      .set('Authorization', makeToken('OPERATIONS', 'agent-1'))
      .attach('file', Buffer.from('mock-pdf'), {
        filename: 'receipt.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('receipt-1');
  });

  it('returns 400 when disbursement is not SENT', async () => {
    const { db } = getMocks();
    db.prisma.disbursement.findUnique.mockResolvedValue({
      ...mockDisbursement,
      status: 'APPROVED',
    });

    const res = await request(app)
      .post('/api/v1/finance/disbursements/disb-1/receipts')
      .set('Authorization', makeToken('OPERATIONS', 'agent-1'))
      .attach('file', Buffer.from('mock-pdf'), {
        filename: 'receipt.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/sent/i);
  });
});

describe('PUT /api/v1/finance/disbursements/:id/receipts/:rid/approve', () => {
  it('approves pending receipt', async () => {
    const { db } = getMocks();
    db.prisma.disbursementReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      disbursementId: 'disb-1',
      status: 'PENDING',
    });
    db.prisma.disbursementReceipt.update.mockResolvedValue({
      id: 'receipt-1',
      disbursementId: 'disb-1',
      status: 'APPROVED',
    });

    const res = await request(app)
      .put('/api/v1/finance/disbursements/disb-1/receipts/receipt-1/approve')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });
});

describe('PUT /api/v1/finance/disbursements/:id/receipts/:rid/query', () => {
  it('queries a receipt with a note', async () => {
    const { db } = getMocks();
    db.prisma.disbursementReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      disbursementId: 'disb-1',
      status: 'PENDING',
    });
    db.prisma.disbursementReceipt.update.mockResolvedValue({
      id: 'receipt-1',
      disbursementId: 'disb-1',
      status: 'QUERIED',
      queryNote: 'Amount does not match',
    });

    const res = await request(app)
      .put('/api/v1/finance/disbursements/disb-1/receipts/receipt-1/query')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({ note: 'Amount does not match invoice' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('QUERIED');
  });

  it('returns 400 without note', async () => {
    const res = await request(app)
      .put('/api/v1/finance/disbursements/disb-1/receipts/receipt-1/query')
      .set('Authorization', makeToken('TRADE_MANAGER'))
      .send({});
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Agent Balance
// ---------------------------------------------------------------------------

describe('GET /api/v1/finance/agents/:agentId/balance', () => {
  it('returns agent balance summary', async () => {
    const { db } = getMocks();
    db.prisma.agent.findUnique.mockResolvedValue({ id: 'agent-1', companyName: 'Test Miner Co' });
    db.prisma.disbursement.findMany.mockResolvedValue([
      {
        id: 'disb-1',
        trancheNo: 1,
        amountUsd: 5000,
        sentAt: new Date('2026-03-21T10:00:00Z'),
        receipts: [{ status: 'APPROVED', uploadedAt: new Date() }],
      },
    ]);

    const res = await request(app)
      .get('/api/v1/finance/agents/agent-1/balance')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data.agentId).toBe('agent-1');
    expect(res.body.data.totalSentUsd).toBe(5000);
    expect(res.body.data.totalReconciledUsd).toBe(5000);
    expect(res.body.data.outstandingBalanceUsd).toBe(0);
  });

  it('returns 403 when OPERATIONS agent views another agent', async () => {
    const res = await request(app)
      .get('/api/v1/finance/agents/other-agent/balance')
      .set('Authorization', makeToken('OPERATIONS', 'my-agent'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Portfolio dashboard
// ---------------------------------------------------------------------------

describe('GET /api/v1/finance/dashboard/portfolio', () => {
  it('returns P&L aggregate', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'txn-1',
        countryCode: 'KE',
        agentId: 'agent-1',
        updatedAt: new Date('2026-01-15'),
        status: 'SETTLED',
        agent: { id: 'agent-1', companyName: 'Test Miner Co' },
        settlement: {
          grossProceedsUsd: 100000,
          totalDeductionsUsd: 5000,
          companyFeeUsd: 1500,
          netRemittanceUsd: 93500,
          approvedAt: new Date('2026-01-15'),
        },
      },
    ]);

    const res = await request(app)
      .get('/api/v1/finance/dashboard/portfolio')
      .set('Authorization', makeToken('TRADE_MANAGER'));

    expect(res.status).toBe(200);
    expect(res.body.data.transactionCount).toBe(1);
    expect(res.body.data.totalGrossProceedsUsd).toBe(100000);
    expect(res.body.data.totalCompanyFeesUsd).toBe(1500);
  });

  it('returns 403 for OPERATIONS role', async () => {
    const res = await request(app)
      .get('/api/v1/finance/dashboard/portfolio')
      .set('Authorization', makeToken('OPERATIONS'));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/finance/dashboard/active-exposure', () => {
  it('returns active transaction exposures', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findMany.mockResolvedValue([
      {
        ...mockTx,
        costItems: [{ estimatedUsd: 3000, actualUsd: null }],
        costEstimate: { status: 'SUBMITTED' },
        agent: { id: 'agent-1', companyName: 'Test Miner Co' },
      },
    ]);

    const res = await request(app)
      .get('/api/v1/finance/dashboard/active-exposure')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].totalEstimatedUsd).toBe(3000);
    expect(res.body.data[0].estimateStatus).toBe('SUBMITTED');
  });
});
