import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    client: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    sanctionsScreening: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    kycRecord: { findMany: jest.fn() },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: {},
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
    constructor(resource: string, id?: string) {
      super(id ? `${resource} with id '${id}' not found` : `${resource} not found`);
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
      client: {
        create: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      transaction: { findMany: jest.Mock; count: jest.Mock };
      sanctionsScreening: { findFirst: jest.Mock; findMany: jest.Mock };
      kycRecord: { findMany: jest.Mock };
    };
  };
  return db.prisma;
}

const adminToken = () =>
  jwtLib.signAccessToken({ id: 'admin-1', email: 'admin@aop.local', role: 'ADMIN' });

const complianceToken = () =>
  jwtLib.signAccessToken({ id: 'co-1', email: 'co@aop.local', role: 'COMPLIANCE_OFFICER' });

const operationsToken = (agentId?: string) =>
  jwtLib.signAccessToken({ id: 'ops-1', email: 'ops@aop.local', role: 'OPERATIONS', agentId });

const baseClient = {
  id: 'client-abc',
  fullName: 'Test Miner',
  entityType: 'INDIVIDUAL',
  countryCode: 'KE',
  kycStatus: 'PENDING',
  sanctionsStatus: 'PENDING',
  riskRating: 'MEDIUM',
  isPEP: false,
  isEDD: false,
  assignedAgentId: 'agent-xyz',
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/v1/clients
// ---------------------------------------------------------------------------

describe('POST /api/v1/clients', () => {
  it('creates a client as ADMIN', async () => {
    const db = getMocks();
    db.client.create.mockResolvedValue(baseClient);

    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ fullName: 'Test Miner', entityType: 'INDIVIDUAL', countryCode: 'KE' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(db.client.create).toHaveBeenCalledTimes(1);
  });

  it('creates a client as OPERATIONS (sets own agentId)', async () => {
    const db = getMocks();
    db.client.create.mockResolvedValue({ ...baseClient, assignedAgentId: 'agent-xyz' });

    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${operationsToken('agent-xyz')}`)
      .send({ fullName: 'Agent Client', entityType: 'COMPANY', countryCode: 'UG' });

    expect(res.status).toBe(201);
    expect(db.client.create.mock.calls[0][0].data.assignedAgentId).toBe('agent-xyz');
  });

  it('returns 403 for VIEWER role', async () => {
    const token = jwtLib.signAccessToken({ id: 'v1', email: 'v@aop.local', role: 'VIEWER' });
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Test', entityType: 'INDIVIDUAL', countryCode: 'KE' });

    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid input', async () => {
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ fullName: 'X', entityType: 'INVALID' }); // missing countryCode, bad entityType

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/clients')
      .send({ fullName: 'Test', entityType: 'INDIVIDUAL', countryCode: 'KE' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/clients
// ---------------------------------------------------------------------------

describe('GET /api/v1/clients', () => {
  it('returns paginated client list', async () => {
    const db = getMocks();
    db.client.findMany.mockResolvedValue([baseClient]);
    db.client.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('scopes results for OPERATIONS user with agentId', async () => {
    const db = getMocks();
    db.client.findMany.mockResolvedValue([baseClient]);
    db.client.count.mockResolvedValue(1);

    await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${operationsToken('agent-xyz')}`);

    const whereArg = db.client.findMany.mock.calls[0][0].where;
    expect(whereArg.assignedAgentId).toBe('agent-xyz');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/clients/:id
// ---------------------------------------------------------------------------

describe('GET /api/v1/clients/:id', () => {
  it('returns client 360 view', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.kycRecord.findMany.mockResolvedValue([]);
    db.sanctionsScreening.findFirst.mockResolvedValue(null);
    db.transaction.count.mockResolvedValue(3);

    const res = await request(app)
      .get('/api/v1/clients/client-abc')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.transactionCount).toBe(3);
  });

  it('returns 404 for unknown client', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/clients/does-not-exist')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });

  it("returns 403 for OPERATIONS user accessing another agent's client", async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue({ ...baseClient, assignedAgentId: 'other-agent' });

    const res = await request(app)
      .get('/api/v1/clients/client-abc')
      .set('Authorization', `Bearer ${operationsToken('agent-xyz')}`);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/clients/:id
// ---------------------------------------------------------------------------

describe('PUT /api/v1/clients/:id', () => {
  it('updates client as ADMIN', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.client.update.mockResolvedValue({ ...baseClient, fullName: 'Updated Name' });

    const res = await request(app)
      .put('/api/v1/clients/client-abc')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ fullName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(db.client.update).toHaveBeenCalledTimes(1);
  });

  it('returns 403 for OPERATIONS role', async () => {
    const res = await request(app)
      .put('/api/v1/clients/client-abc')
      .set('Authorization', `Bearer ${operationsToken()}`)
      .send({ fullName: 'Updated' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/clients/:id/transactions
// ---------------------------------------------------------------------------

describe('GET /api/v1/clients/:id/transactions', () => {
  it('returns paginated transactions', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.transaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        phase: 'PHASE_1',
        status: 'DRAFT',
        goldWeightGross: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    db.transaction.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/clients/client-abc/transactions')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/clients/:id/flags/edd
// ---------------------------------------------------------------------------

describe('PUT /api/v1/clients/:id/flags/edd', () => {
  it('sets EDD flag as COMPLIANCE_OFFICER', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.client.update.mockResolvedValue({ ...baseClient, isEDD: true });

    const res = await request(app)
      .put('/api/v1/clients/client-abc/flags/edd')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({ value: true });

    expect(res.status).toBe(200);
    expect(db.client.update.mock.calls[0][0].data.isEDD).toBe(true);
  });

  it('returns 403 for ADMIN role', async () => {
    const res = await request(app)
      .put('/api/v1/clients/client-abc/flags/edd')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ value: true });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/clients/:id/flags/pep
// ---------------------------------------------------------------------------

describe('PUT /api/v1/clients/:id/flags/pep', () => {
  it('sets PEP flag as COMPLIANCE_OFFICER', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.client.update.mockResolvedValue({ ...baseClient, isPEP: true });

    const res = await request(app)
      .put('/api/v1/clients/client-abc/flags/pep')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({ value: true });

    expect(res.status).toBe(200);
    expect(db.client.update.mock.calls[0][0].data.isPEP).toBe(true);
  });
});
