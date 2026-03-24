import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    client: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    sanctionsScreening: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    kycRecord: { findMany: jest.fn() },
    transaction: { count: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: {},
  setRefreshToken: jest.fn().mockResolvedValue(undefined),
  hasRefreshToken: jest.fn().mockResolvedValue(true),
  deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
  deleteAllUserTokens: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

// Force the live ComplyAdvantage provider so tests can control axios.post behaviour
jest.mock('../lib/integrations/sanctions/factory', () => {
  const { ComplyAdvantageSanctionsProvider } = jest.requireActual(
    '../lib/integrations/sanctions/live',
  );
  const { MockSanctionsProvider } = jest.requireActual('../lib/integrations/sanctions/mock');
  return {
    getSanctionsProvider: () =>
      process.env.SANCTIONS_API_KEY
        ? new ComplyAdvantageSanctionsProvider(process.env.SANCTIONS_API_KEY)
        : new MockSanctionsProvider(),
    _resetSanctionsProvider: jest.fn(),
  };
});

// Also mock the email service used by sanctions notifications
jest.mock('../lib/integrations/email/email.service', () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue(undefined),
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
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
    details: unknown;
    constructor(msg: string, details?: unknown) {
      super(msg);
      this.name = 'ValidationError';
      this.details = details;
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
  ExternalServiceError: class ExternalServiceError extends Error {
    statusCode = 502;
    code = 'EXTERNAL_SERVICE_ERROR';
    constructor(service: string, msg: string, _details?: unknown) {
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
      client: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
      sanctionsScreening: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
      user: { findMany: jest.Mock };
      kycRecord: { findMany: jest.Mock };
      transaction: { count: jest.Mock };
    };
  };
  return db.prisma;
}

function getAxiosMock() {
  const mod = jest.requireMock('axios') as { default: { post: jest.Mock } };
  return mod.default;
}

const complianceToken = () =>
  jwtLib.signAccessToken({ id: 'co-1', email: 'co@aop.local', role: 'COMPLIANCE_OFFICER' });

const baseClient = {
  id: 'client-abc',
  fullName: 'Test Miner',
  entityType: 'INDIVIDUAL',
  countryCode: 'KE',
  kycStatus: 'PENDING',
  sanctionsStatus: 'PENDING',
  isPEP: false,
  isEDD: false,
  assignedAgentId: 'agent-xyz',
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SANCTIONS_API_KEY;
  delete process.env.SANCTIONS_API_URL;
});

// ---------------------------------------------------------------------------
// POST /api/v1/clients/:id/screening
// ---------------------------------------------------------------------------

describe('POST /api/v1/clients/:id/screening', () => {
  it('returns CLEAR when API key is not set (mock mode)', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.sanctionsScreening.create.mockResolvedValue({
      id: 'screen-1',
      clientId: 'client-abc',
      outcome: 'CLEAR',
    });
    db.client.update.mockResolvedValue({ ...baseClient, sanctionsStatus: 'CLEAR' });

    const res = await request(app)
      .post('/api/v1/clients/client-abc/screening')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(db.sanctionsScreening.create.mock.calls[0][0].data.outcome).toBe('CLEAR');
  });

  it('returns CLEAR result from real API call', async () => {
    process.env.SANCTIONS_API_KEY = 'test-key';
    process.env.SANCTIONS_API_URL = 'https://api.complyadvantage.com';

    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.sanctionsScreening.create.mockResolvedValue({
      id: 'screen-2',
      clientId: 'client-abc',
      outcome: 'CLEAR',
    });
    db.client.update.mockResolvedValue({ ...baseClient, sanctionsStatus: 'CLEAR' });

    const axiosMock = getAxiosMock();
    axiosMock.post.mockResolvedValue({
      data: { content: { number_of_hits: 0, hits: [] } },
    });

    const res = await request(app)
      .post('/api/v1/clients/client-abc/screening')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(201);
    expect(db.sanctionsScreening.create.mock.calls[0][0].data.outcome).toBe('CLEAR');
  });

  it('sets kycStatus to REJECTED when outcome is HIT', async () => {
    process.env.SANCTIONS_API_KEY = 'test-key';
    process.env.SANCTIONS_API_URL = 'https://api.complyadvantage.com';

    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.sanctionsScreening.create.mockResolvedValue({
      id: 'screen-3',
      clientId: 'client-abc',
      outcome: 'HIT',
    });
    db.client.update.mockResolvedValue({
      ...baseClient,
      sanctionsStatus: 'HIT',
      kycStatus: 'REJECTED',
    });
    db.user.findMany.mockResolvedValue([]);

    const axiosMock = getAxiosMock();
    axiosMock.post.mockResolvedValue({
      data: {
        content: {
          number_of_hits: 1,
          hits: [{ match_status: 'true_positive', match_types: ['sanction'] }],
        },
      },
    });

    const res = await request(app)
      .post('/api/v1/clients/client-abc/screening')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(201);
    expect(db.sanctionsScreening.create.mock.calls[0][0].data.outcome).toBe('HIT');
    // kycStatus should be set to REJECTED
    const updateCall = db.client.update.mock.calls[0][0];
    expect(updateCall.data.kycStatus).toBe('REJECTED');
  });

  it('returns POSSIBLE_MATCH when hits exist but none are sanctions', async () => {
    process.env.SANCTIONS_API_KEY = 'test-key';
    process.env.SANCTIONS_API_URL = 'https://api.complyadvantage.com';

    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.sanctionsScreening.create.mockResolvedValue({
      id: 'screen-4',
      clientId: 'client-abc',
      outcome: 'POSSIBLE_MATCH',
    });
    db.client.update.mockResolvedValue({
      ...baseClient,
      sanctionsStatus: 'POSSIBLE_MATCH',
    });

    const axiosMock = getAxiosMock();
    axiosMock.post.mockResolvedValue({
      data: {
        content: {
          number_of_hits: 1,
          hits: [{ match_status: 'potential_match', match_types: ['pep'] }],
        },
      },
    });

    const res = await request(app)
      .post('/api/v1/clients/client-abc/screening')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(201);
    expect(db.sanctionsScreening.create.mock.calls[0][0].data.outcome).toBe('POSSIBLE_MATCH');
  });

  it('returns 502 when ComplyAdvantage API call fails', async () => {
    process.env.SANCTIONS_API_KEY = 'test-key';
    process.env.SANCTIONS_API_URL = 'https://api.complyadvantage.com';

    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);

    const axiosMock = getAxiosMock();
    axiosMock.post.mockRejectedValue(new Error('Network error'));

    const res = await request(app)
      .post('/api/v1/clients/client-abc/screening')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(502);
  });

  it('returns 404 for unknown client', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/clients/does-not-exist/screening')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 403 for non-COMPLIANCE_OFFICER role', async () => {
    const token = jwtLib.signAccessToken({ id: 'adm-1', email: 'admin@aop.local', role: 'ADMIN' });

    const res = await request(app)
      .post('/api/v1/clients/client-abc/screening')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/clients/screening/batch
// ---------------------------------------------------------------------------

describe('POST /api/v1/clients/screening/batch', () => {
  it('screens all clients and returns summary', async () => {
    const db = getMocks();
    db.client.findMany.mockResolvedValue([{ id: 'client-1' }, { id: 'client-2' }]);

    // For each screenClient call, need findUnique, sanctionsScreening.create, client.update
    db.client.findUnique
      .mockResolvedValueOnce({ ...baseClient, id: 'client-1' })
      .mockResolvedValueOnce({ ...baseClient, id: 'client-2' });

    db.sanctionsScreening.create
      .mockResolvedValueOnce({ id: 's1', outcome: 'CLEAR' })
      .mockResolvedValueOnce({ id: 's2', outcome: 'CLEAR' });

    db.client.update
      .mockResolvedValueOnce({ ...baseClient, id: 'client-1', sanctionsStatus: 'CLEAR' })
      .mockResolvedValueOnce({ ...baseClient, id: 'client-2', sanctionsStatus: 'CLEAR' });

    const res = await request(app)
      .post('/api/v1/clients/screening/batch')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.screened).toBe(2);
    expect(res.body.data.errors).toBe(0);
  });

  it('handles partial failures gracefully via allSettled', async () => {
    const db = getMocks();
    db.client.findMany.mockResolvedValue([{ id: 'client-1' }, { id: 'client-2' }]);

    // First client succeeds, second fails
    db.client.findUnique
      .mockResolvedValueOnce({ ...baseClient, id: 'client-1' })
      .mockResolvedValueOnce(null); // causes NotFoundError for client-2

    db.sanctionsScreening.create.mockResolvedValueOnce({ id: 's1', outcome: 'CLEAR' });
    db.client.update.mockResolvedValueOnce({
      ...baseClient,
      id: 'client-1',
      sanctionsStatus: 'CLEAR',
    });

    const res = await request(app)
      .post('/api/v1/clients/screening/batch')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.screened).toBe(1);
    expect(res.body.data.errors).toBe(1);
  });
});
