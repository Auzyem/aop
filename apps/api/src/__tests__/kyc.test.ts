import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    client: { findUnique: jest.fn(), update: jest.fn() },
    kycRecord: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    document: { create: jest.fn() },
    user: { findMany: jest.fn() },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: {},
  setRefreshToken: jest.fn().mockResolvedValue(undefined),
  hasRefreshToken: jest.fn().mockResolvedValue(true),
  deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/s3', () => ({
  uploadToS3: jest.fn().mockResolvedValue({
    storageKey: 'kyc/client-abc/NATIONAL_ID/2024-01-01T00-00-00-test.pdf',
    url: 'https://s3.example.com/kyc/test.pdf',
  }),
}));

jest.mock('../lib/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

// Mock ClamAV (ENOENT — not installed)
jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, _opts, cb) =>
    cb(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  ),
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
      client: { findUnique: jest.Mock; update: jest.Mock };
      kycRecord: {
        create: jest.Mock;
        findUnique: jest.Mock;
        findMany: jest.Mock;
        update: jest.Mock;
      };
      document: { create: jest.Mock };
      user: { findMany: jest.Mock };
    };
  };
  return db.prisma;
}

const complianceToken = () =>
  jwtLib.signAccessToken({ id: 'co-1', email: 'co@aop.local', role: 'COMPLIANCE_OFFICER' });

const operationsToken = (agentId = 'agent-xyz') =>
  jwtLib.signAccessToken({ id: 'ops-1', email: 'ops@aop.local', role: 'OPERATIONS', agentId });

const adminToken = () =>
  jwtLib.signAccessToken({ id: 'adm-1', email: 'admin@aop.local', role: 'ADMIN' });

const baseClient = {
  id: 'client-abc',
  fullName: 'Test Miner',
  entityType: 'INDIVIDUAL',
  countryCode: 'KE',
  kycStatus: 'PENDING',
  sanctionsStatus: 'CLEAR',
  isPEP: false,
  isEDD: false,
  assignedAgentId: 'agent-xyz',
};

const baseKycRecord = {
  id: 'kycrec-1',
  clientId: 'client-abc',
  documentType: 'NATIONAL_ID',
  fileUrl: 'https://s3.example.com/test.pdf',
  uploadedBy: 'ops-1',
  uploadedAt: new Date(),
  status: 'PENDING',
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
  retainUntil: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/v1/clients/:id/kyc/documents
// ---------------------------------------------------------------------------

describe('POST /api/v1/clients/:id/kyc/documents', () => {
  it('uploads a KYC document successfully', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.document.create.mockResolvedValue({ id: 'doc-1' });
    db.kycRecord.create.mockResolvedValue(baseKycRecord);

    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/documents')
      .set('Authorization', `Bearer ${operationsToken()}`)
      .field('documentType', 'NATIONAL_ID')
      .attach('file', Buffer.from('fake pdf content'), {
        filename: 'id.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(db.kycRecord.create).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for missing file', async () => {
    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/documents')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({ documentType: 'NATIONAL_ID' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for disallowed mime type', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);

    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/documents')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .field('documentType', 'NATIONAL_ID')
      .attach('file', Buffer.from('fake exe'), {
        filename: 'virus.exe',
        contentType: 'application/octet-stream',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when documentType is missing', async () => {
    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/documents')
      .set('Authorization', `Bearer ${operationsToken()}`)
      .attach('file', Buffer.from('pdf'), {
        filename: 'id.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for ADMIN role', async () => {
    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/documents')
      .set('Authorization', `Bearer ${adminToken()}`)
      .field('documentType', 'NATIONAL_ID')
      .attach('file', Buffer.from('pdf'), { filename: 'id.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/clients/:id/kyc/documents/:docId/approve
// ---------------------------------------------------------------------------

describe('PUT /api/v1/clients/:id/kyc/documents/:docId/approve', () => {
  it('approves a KYC document as COMPLIANCE_OFFICER', async () => {
    const db = getMocks();
    db.kycRecord.findUnique.mockResolvedValue(baseKycRecord);
    db.kycRecord.update.mockResolvedValue({ ...baseKycRecord, status: 'APPROVED' });

    const res = await request(app)
      .put('/api/v1/clients/client-abc/kyc/documents/kycrec-1/approve')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(200);
    expect(db.kycRecord.update.mock.calls[0][0].data.status).toBe('APPROVED');
  });

  it('returns 404 for unknown document', async () => {
    const db = getMocks();
    db.kycRecord.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/clients/client-abc/kyc/documents/bad-id/approve')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/clients/:id/kyc/documents/:docId/reject
// ---------------------------------------------------------------------------

describe('PUT /api/v1/clients/:id/kyc/documents/:docId/reject', () => {
  it('rejects a KYC document with a reason', async () => {
    const db = getMocks();
    db.kycRecord.findUnique.mockResolvedValue(baseKycRecord);
    db.kycRecord.update.mockResolvedValue({
      ...baseKycRecord,
      status: 'REJECTED',
      rejectionReason: 'Expired document',
    });

    const res = await request(app)
      .put('/api/v1/clients/client-abc/kyc/documents/kycrec-1/reject')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({ reason: 'Expired document' });

    expect(res.status).toBe(200);
    expect(db.kycRecord.update.mock.calls[0][0].data.status).toBe('REJECTED');
  });

  it('returns 400 when reason is missing', async () => {
    const res = await request(app)
      .put('/api/v1/clients/client-abc/kyc/documents/kycrec-1/reject')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/clients/:id/kyc/approve (full KYC)
// ---------------------------------------------------------------------------

describe('POST /api/v1/clients/:id/kyc/approve', () => {
  it('approves full KYC when all mandatory docs are approved and sanctions are CLEAR', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue({
      ...baseClient,
      entityType: 'INDIVIDUAL',
      sanctionsStatus: 'CLEAR',
      isPEP: false,
      kycRecords: [
        { status: 'APPROVED', documentType: 'NATIONAL_ID' },
        { status: 'APPROVED', documentType: 'PROOF_OF_ADDRESS' },
        { status: 'APPROVED', documentType: 'SOURCE_OF_FUNDS' },
      ],
    });
    db.client.update.mockResolvedValue({ ...baseClient, kycStatus: 'APPROVED' });
    db.user.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/approve')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(200);
    expect(db.client.update.mock.calls[0][0].data.kycStatus).toBe('APPROVED');
  });

  it('returns 400 when sanctions status is HIT', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue({
      ...baseClient,
      sanctionsStatus: 'HIT',
      kycRecords: [],
    });

    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/approve')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when mandatory documents are missing', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue({
      ...baseClient,
      entityType: 'INDIVIDUAL',
      sanctionsStatus: 'CLEAR',
      isPEP: false,
      kycRecords: [{ status: 'APPROVED', documentType: 'NATIONAL_ID' }], // missing 2 mandatory
    });

    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/approve')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when client is PEP without EDD complete', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue({
      ...baseClient,
      entityType: 'INDIVIDUAL',
      sanctionsStatus: 'CLEAR',
      isPEP: true,
      isEDD: false,
      kycRecords: [
        { status: 'APPROVED', documentType: 'NATIONAL_ID' },
        { status: 'APPROVED', documentType: 'PROOF_OF_ADDRESS' },
        { status: 'APPROVED', documentType: 'SOURCE_OF_FUNDS' },
      ],
    });

    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/approve')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/clients/:id/kyc/reject (full KYC)
// ---------------------------------------------------------------------------

describe('POST /api/v1/clients/:id/kyc/reject', () => {
  it('rejects full KYC with a reason', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue(baseClient);
    db.client.update.mockResolvedValue({ ...baseClient, kycStatus: 'REJECTED' });

    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/reject')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({ reason: 'Documents are fraudulent' });

    expect(res.status).toBe(200);
    expect(db.client.update.mock.calls[0][0].data.kycStatus).toBe('REJECTED');
  });

  it('returns 400 when reason is missing', async () => {
    const res = await request(app)
      .post('/api/v1/clients/client-abc/kyc/reject')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/clients/:id/kyc
// ---------------------------------------------------------------------------

describe('GET /api/v1/clients/:id/kyc', () => {
  it('returns KYC summary with mandatory docs status', async () => {
    const db = getMocks();
    db.client.findUnique.mockResolvedValue({
      ...baseClient,
      entityType: 'INDIVIDUAL',
      kycRecords: [
        {
          status: 'APPROVED',
          documentType: 'NATIONAL_ID',
          uploadedByUser: { id: 'u1', email: 'u@t.com' },
        },
      ],
    });

    const res = await request(app)
      .get('/api/v1/clients/client-abc/kyc')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.missingDocs).toContain('PROOF_OF_ADDRESS');
    expect(res.body.data.missingDocs).toContain('SOURCE_OF_FUNDS');
  });
});
