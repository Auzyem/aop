import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    agent: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    systemSettings: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditEvent: { findMany: jest.fn(), count: jest.fn(), create: jest.fn().mockResolvedValue({}) },
    disbursement: { findMany: jest.fn(), aggregate: jest.fn(), count: jest.fn() },
    disbursementReceipt: { findMany: jest.fn() },
    transaction: { findMany: jest.fn(), count: jest.fn() },
    document: { count: jest.fn() },
    phaseHistory: { findMany: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') },
  setRefreshToken: jest.fn().mockResolvedValue(undefined),
  hasRefreshToken: jest.fn().mockResolvedValue(true),
  deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
  deleteAllUserTokens: jest.fn().mockResolvedValue(undefined),
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

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2b$hash'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMocks() {
  const db = jest.requireMock('@aop/db') as {
    prisma: {
      user: {
        findMany: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        count: jest.Mock;
      };
      agent: {
        findMany: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        count: jest.Mock;
      };
      systemSettings: {
        findMany: jest.Mock;
        findUnique: jest.Mock;
        upsert: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
      };
      auditEvent: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock };
      disbursement: { findMany: jest.Mock; aggregate: jest.Mock; count: jest.Mock };
      transaction: { findMany: jest.Mock; count: jest.Mock };
    };
  };
  return { db };
}

function makeToken(role: string, agentId?: string): string {
  jest.spyOn(jwtLib, 'verifyAccessToken').mockReturnValue({
    sub: 'user-admin-1',
    email: 'admin@test.com',
    role,
    agentId: agentId ?? null,
    countryCode: 'KE',
    type: 'access',
    iat: 0,
    exp: 9999999999,
  } as unknown as ReturnType<typeof jwtLib.verifyAccessToken>);
  return 'Bearer mock-token';
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'user-1',
  email: 'user@test.com',
  role: 'VIEWER',
  countryCode: 'KE',
  isActive: true,
  agentId: null,
  twoFactorSecret: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  agent: null,
};

const mockAgent = {
  id: 'agent-1',
  companyName: 'Test Agency Ltd',
  countryCode: 'KE',
  contactName: 'John Doe',
  contactEmail: 'agent@test.com',
  licenceNo: 'LIC-001',
  kycStatus: 'PENDING',
  bankName: null,
  bankAccount: null,
  swiftBic: null,
  docAccuracyScore: null,
  avgPhaseCompletionDays: null,
  complianceScore: null,
  performanceScore: null,
  performanceScoredAt: null,
  isActive: true,
  createdAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. User management RBAC
// ---------------------------------------------------------------------------

describe('Admin API — RBAC', () => {
  it('OPERATIONS role cannot access /admin/users → 403', async () => {
    const token = makeToken('OPERATIONS', 'agent-1');
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', token);

    expect(res.status).toBe(403);
  });

  it('OPERATIONS role cannot access /admin/agents → 403', async () => {
    const token = makeToken('OPERATIONS', 'agent-1');
    const res = await request(app).get('/api/v1/admin/agents').set('Authorization', token);

    expect(res.status).toBe(403);
  });

  it('VIEWER can access /admin/agents but not create → 403', async () => {
    const { db } = getMocks();
    db.prisma.agent.findMany.mockResolvedValue([mockAgent]);
    db.prisma.agent.count.mockResolvedValue(1);

    const token = makeToken('VIEWER');
    const listRes = await request(app).get('/api/v1/admin/agents').set('Authorization', token);
    expect(listRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/admin/agents')
      .set('Authorization', token)
      .send({
        companyName: 'New Agency',
        countryCode: 'KE',
        contactName: 'Jane',
        licenceNo: 'LIC-002',
      });
    expect(createRes.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 2. User management CRUD
// ---------------------------------------------------------------------------

describe('Admin API — User CRUD', () => {
  it('POST /admin/users creates a user (201)', async () => {
    const { db } = getMocks();
    db.prisma.user.findUnique.mockResolvedValue(null); // email not taken
    db.prisma.user.create.mockResolvedValue({ ...mockUser, id: 'user-new', agent: null });

    const token = makeToken('ADMIN');
    const res = await request(app).post('/api/v1/admin/users').set('Authorization', token).send({
      email: 'newuser@test.com',
      password: 'password123',
      role: 'VIEWER',
      countryCode: 'KE',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /admin/users lists users', async () => {
    const { db } = getMocks();
    db.prisma.user.findMany.mockResolvedValue([mockUser]);
    db.prisma.user.count.mockResolvedValue(1);

    const token = makeToken('ADMIN');
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET /admin/users/:id returns user detail', async () => {
    const { db } = getMocks();
    db.prisma.user.findUnique.mockResolvedValue({ ...mockUser, agent: null });

    const token = makeToken('ADMIN');
    const res = await request(app).get('/api/v1/admin/users/user-1').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('user-1');
    // passwordHash must not be in response
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('PUT /admin/users/:id updates user role', async () => {
    const { db } = getMocks();
    db.prisma.user.findUnique.mockResolvedValue(mockUser);
    db.prisma.user.update.mockResolvedValue({ ...mockUser, role: 'TRADE_MANAGER', agent: null });

    const token = makeToken('ADMIN');
    const res = await request(app)
      .put('/api/v1/admin/users/user-1')
      .set('Authorization', token)
      .send({ role: 'TRADE_MANAGER' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('TRADE_MANAGER');
  });

  it('DELETE /admin/users/:id deactivates user (soft delete)', async () => {
    const { db } = getMocks();
    db.prisma.user.findUnique.mockResolvedValue({ ...mockUser, id: 'user-other' });
    db.prisma.user.update.mockResolvedValue({
      ...mockUser,
      id: 'user-other',
      isActive: false,
      agent: null,
    });

    const token = makeToken('ADMIN');
    const res = await request(app)
      .delete('/api/v1/admin/users/user-other')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('DELETE /admin/users/:id prevents self-deactivation → 400', async () => {
    const { db } = getMocks();
    // The actor id is 'user-admin-1' from makeToken
    db.prisma.user.findUnique.mockResolvedValue({ ...mockUser, id: 'user-admin-1' });

    const token = makeToken('ADMIN');
    const res = await request(app)
      .delete('/api/v1/admin/users/user-admin-1')
      .set('Authorization', token);

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 3. Agent management
// ---------------------------------------------------------------------------

describe('Admin API — Agent management', () => {
  it('POST /admin/agents creates an agent (201)', async () => {
    const { db } = getMocks();
    db.prisma.agent.create.mockResolvedValue(mockAgent);

    const token = makeToken('ADMIN');
    const res = await request(app).post('/api/v1/admin/agents').set('Authorization', token).send({
      companyName: 'Test Agency Ltd',
      countryCode: 'KE',
      contactName: 'John Doe',
      licenceNo: 'LIC-001',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.companyName).toBe('Test Agency Ltd');
  });

  it('GET /admin/agents lists agents (all countries for head office)', async () => {
    const { db } = getMocks();
    db.prisma.agent.findMany.mockResolvedValue([mockAgent]);
    db.prisma.agent.count.mockResolvedValue(1);

    const token = makeToken('ADMIN');
    const res = await request(app).get('/api/v1/admin/agents').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET /admin/agents?country=KE filters by country', async () => {
    const { db } = getMocks();
    db.prisma.agent.findMany.mockResolvedValue([mockAgent]);
    db.prisma.agent.count.mockResolvedValue(1);

    const token = makeToken('ADMIN');
    const res = await request(app)
      .get('/api/v1/admin/agents?country=KE')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    // Verify prisma was called with the country filter
    const call = db.prisma.agent.findMany.mock.calls[0][0];
    expect(call.where.countryCode).toBe('KE');
  });

  it('GET /admin/agents/:id returns agent detail with outstanding balance', async () => {
    const { db } = getMocks();
    db.prisma.agent.findUnique.mockResolvedValue({
      ...mockAgent,
      users: [],
      transactions: [],
    });
    db.prisma.disbursement.findMany.mockResolvedValue([]);

    const token = makeToken('ADMIN');
    const res = await request(app).get('/api/v1/admin/agents/agent-1').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.outstandingBalanceUsd).toBe(0);
  });

  it('PUT /admin/agents/:id/deactivate deactivates agent', async () => {
    const { db } = getMocks();
    db.prisma.agent.findUnique.mockResolvedValue(mockAgent);
    db.prisma.agent.update.mockResolvedValue({ ...mockAgent, isActive: false });

    const token = makeToken('ADMIN');
    const res = await request(app)
      .put('/api/v1/admin/agents/agent-1/deactivate')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Settings
// ---------------------------------------------------------------------------

describe('Admin API — Settings', () => {
  it('GET /admin/settings returns merged defaults when DB is empty', async () => {
    const { db } = getMocks();
    db.prisma.systemSettings.findMany.mockResolvedValue([]);

    const token = makeToken('ADMIN');
    const res = await request(app).get('/api/v1/admin/settings').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.PRICE_ALERT_THRESHOLD_PCT).toBe(2);
    expect(res.body.data.FINANCE_APPROVAL_THRESHOLD_USD).toBe(10000);
    expect(res.body.data.COMPANY_DEFAULT_FEE_PCT).toBe(5);
  });

  it('PUT /admin/settings/:key updates a setting', async () => {
    const { db } = getMocks();
    const updatedSetting = {
      id: 'setting-1',
      key: 'PRICE_ALERT_THRESHOLD_PCT',
      value: 5,
      updatedBy: 'user-admin-1',
      updatedAt: new Date(),
    };
    db.prisma.systemSettings.upsert.mockResolvedValue(updatedSetting);

    const token = makeToken('ADMIN');
    const res = await request(app)
      .put('/api/v1/admin/settings/PRICE_ALERT_THRESHOLD_PCT')
      .set('Authorization', token)
      .send({ value: 5 });

    expect(res.status).toBe(200);
    expect(db.prisma.systemSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'PRICE_ALERT_THRESHOLD_PCT' },
        update: expect.objectContaining({ value: 5 }),
      }),
    );
  });

  it('PUT /admin/settings/:key with DB value overrides default', async () => {
    const { db } = getMocks();
    db.prisma.systemSettings.findMany.mockResolvedValue([
      {
        key: 'PRICE_ALERT_THRESHOLD_PCT',
        value: 7,
        updatedBy: null,
        updatedAt: new Date(),
        id: '1',
      },
    ]);

    const token = makeToken('ADMIN');
    const res = await request(app).get('/api/v1/admin/settings').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.PRICE_ALERT_THRESHOLD_PCT).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 5. Audit log
// ---------------------------------------------------------------------------

describe('Admin API — Audit log', () => {
  const mockAuditEvent = {
    id: 'audit-1',
    entityType: 'Transaction',
    entityId: 'txn-1',
    action: 'UPDATE',
    oldValue: null,
    newValue: { phase: 'PHASE_2' },
    userId: 'user-1',
    ipAddress: '127.0.0.1',
    userAgent: 'test',
    createdAt: new Date(),
    user: { id: 'user-1', email: 'admin@test.com', role: 'ADMIN' },
  };

  it('GET /admin/audit returns paginated audit events', async () => {
    const { db } = getMocks();
    db.prisma.auditEvent.findMany.mockResolvedValue([mockAuditEvent]);
    db.prisma.auditEvent.count.mockResolvedValue(1);

    const token = makeToken('SUPER_ADMIN');
    const res = await request(app).get('/api/v1/admin/audit').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /admin/audit with filters applies them to query', async () => {
    const { db } = getMocks();
    db.prisma.auditEvent.findMany.mockResolvedValue([]);
    db.prisma.auditEvent.count.mockResolvedValue(0);

    const token = makeToken('COMPLIANCE_OFFICER');
    const res = await request(app)
      .get('/api/v1/admin/audit?entityType=Transaction&action=UPDATE')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    const call = db.prisma.auditEvent.findMany.mock.calls[0][0];
    expect(call.where.entityType).toBe('Transaction');
    expect(call.where.action).toBe('UPDATE');
  });

  it('GET /admin/audit pagination is applied', async () => {
    const { db } = getMocks();
    db.prisma.auditEvent.findMany.mockResolvedValue([]);
    db.prisma.auditEvent.count.mockResolvedValue(100);

    const token = makeToken('SUPER_ADMIN');
    const res = await request(app)
      .get('/api/v1/admin/audit?page=2&limit=10')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.limit).toBe(10);
    const call = db.prisma.auditEvent.findMany.mock.calls[0][0];
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it('GET /admin/audit/export returns CSV with correct Content-Type', async () => {
    const { db } = getMocks();
    db.prisma.auditEvent.findMany.mockResolvedValue([mockAuditEvent]);

    const token = makeToken('SUPER_ADMIN');
    const res = await request(app).get('/api/v1/admin/audit/export').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.text).toContain('timestamp,userId,email,role');
  });

  it('GET /admin/audit → 403 for ADMIN role (not SUPER_ADMIN or COMPLIANCE_OFFICER)', async () => {
    const token = makeToken('ADMIN');
    const res = await request(app).get('/api/v1/admin/audit').set('Authorization', token);

    expect(res.status).toBe(403);
  });
});
