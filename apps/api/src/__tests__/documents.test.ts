import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
    },
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

jest.mock('../lib/s3', () => ({
  uploadToS3: jest
    .fn()
    .mockResolvedValue({ storageKey: 'key/test.pdf', url: 'https://s3/test.pdf' }),
  getSignedDownloadUrl: jest.fn().mockResolvedValue('https://s3/signed?token=abc'),
  s3Client: { send: jest.fn() },
}));

jest.mock('../modules/documents/document-upload.service', () => ({
  uploadDocument: jest.fn(),
  initDocumentQueues: jest.fn(),
}));

jest.mock('../modules/documents/document-generator.service', () => ({
  generateSystemDocument: jest.fn(),
}));

jest.mock('../modules/documents/document-bundle.service', () => ({
  bundleTransactionDocuments: jest.fn(),
}));

jest.mock('@aop/utils', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(resource: string) {
      super(`${resource} not found`);
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
      document: {
        create: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
      };
      transaction: { findUnique: jest.Mock };
    };
  };

  const uploadSvc = jest.requireMock('../modules/documents/document-upload.service') as {
    uploadDocument: jest.Mock;
    initDocumentQueues: jest.Mock;
  };

  const genSvc = jest.requireMock('../modules/documents/document-generator.service') as {
    generateSystemDocument: jest.Mock;
  };

  const bundleSvc = jest.requireMock('../modules/documents/document-bundle.service') as {
    bundleTransactionDocuments: jest.Mock;
  };

  return { db, uploadSvc, genSvc, bundleSvc };
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

const mockDocument = {
  id: 'doc-1',
  transactionId: 'txn-1',
  clientId: null,
  documentType: 'MINING_LICENCE',
  filename: 'mine-licence.pdf',
  storageKey: 'documents/txn-1/MINING_LICENCE/2026-01-01-mine-licence.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 102400,
  uploadedBy: 'user-1',
  uploadedAt: new Date('2026-01-01'),
  approvalStatus: 'PENDING',
  isSystemGenerated: false,
  version: 1,
  retainUntil: null,
  isDeleted: false,
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

describe('POST /api/v1/documents', () => {
  it('returns 201 on successful upload', async () => {
    const { uploadSvc } = getMocks();
    uploadSvc.uploadDocument.mockResolvedValue({
      id: 'doc-1',
      storageKey: 'key/test.pdf',
      filename: 'test.pdf',
    });

    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', makeToken('OPERATIONS'))
      .attach('file', Buffer.from('mock-pdf'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      })
      .field('documentType', 'MINING_LICENCE')
      .field('transactionId', 'txn-1');

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('doc-1');
    expect(uploadSvc.uploadDocument).toHaveBeenCalled();
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', makeToken('OPERATIONS'))
      .send({ documentType: 'MINING_LICENCE', transactionId: 'txn-1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when neither transactionId nor clientId provided', async () => {
    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', makeToken('OPERATIONS'))
      .attach('file', Buffer.from('mock-pdf'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      })
      .field('documentType', 'MINING_LICENCE');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for VIEWER role', async () => {
    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', makeToken('VIEWER'))
      .attach('file', Buffer.from('mock-pdf'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      })
      .field('documentType', 'MINING_LICENCE')
      .field('transactionId', 'txn-1');

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

describe('GET /api/v1/documents', () => {
  it('returns paginated documents', async () => {
    const { db } = getMocks();
    db.prisma.document.findMany.mockResolvedValue([mockDocument]);
    db.prisma.document.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/documents?transactionId=txn-1')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('returns 400 for invalid query params', async () => {
    const res = await request(app)
      .get('/api/v1/documents?approvalStatus=INVALID_STATUS')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Get by ID
// ---------------------------------------------------------------------------

describe('GET /api/v1/documents/:id', () => {
  it('returns document by ID', async () => {
    const { db } = getMocks();
    db.prisma.document.findUnique.mockResolvedValue({
      ...mockDocument,
      uploadedByUser: { id: 'user-1', email: 'user@test.com' },
      approvedByUser: null,
    });

    const res = await request(app)
      .get('/api/v1/documents/doc-1')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('doc-1');
  });

  it('returns 404 for unknown document', async () => {
    const { db } = getMocks();
    db.prisma.document.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/documents/unknown')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

describe('GET /api/v1/documents/:id/download', () => {
  it('returns signed URL', async () => {
    const { db } = getMocks();
    db.prisma.document.findUnique.mockResolvedValue(mockDocument);

    const res = await request(app)
      .get('/api/v1/documents/doc-1/download')
      .set('Authorization', makeToken('VIEWER'));

    expect(res.status).toBe(200);
    expect(res.body.data.url).toContain('signed');
  });
});

// ---------------------------------------------------------------------------
// Approve / Reject
// ---------------------------------------------------------------------------

describe('PUT /api/v1/documents/:id/approve', () => {
  it('approves a pending document', async () => {
    const { db } = getMocks();
    db.prisma.document.findUnique.mockResolvedValue({ ...mockDocument, approvalStatus: 'PENDING' });
    db.prisma.document.update.mockResolvedValue({ ...mockDocument, approvalStatus: 'APPROVED' });

    const res = await request(app)
      .put('/api/v1/documents/doc-1/approve')
      .set('Authorization', makeToken('COMPLIANCE_OFFICER'));

    expect(res.status).toBe(200);
    expect(res.body.data.approvalStatus).toBe('APPROVED');
  });

  it('returns 403 for OPERATIONS role', async () => {
    const res = await request(app)
      .put('/api/v1/documents/doc-1/approve')
      .set('Authorization', makeToken('OPERATIONS'));

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/v1/documents/:id/reject', () => {
  it('rejects a document with reason', async () => {
    const { db } = getMocks();
    db.prisma.document.findUnique.mockResolvedValue({ ...mockDocument, approvalStatus: 'PENDING' });
    db.prisma.document.update.mockResolvedValue({
      ...mockDocument,
      approvalStatus: 'REJECTED',
      rejectionReason: 'Blurry image',
    });

    const res = await request(app)
      .put('/api/v1/documents/doc-1/reject')
      .set('Authorization', makeToken('COMPLIANCE_OFFICER'))
      .send({ reason: 'Blurry image' });

    expect(res.status).toBe(200);
    expect(res.body.data.approvalStatus).toBe('REJECTED');
  });

  it('returns 400 without reason', async () => {
    const res = await request(app)
      .put('/api/v1/documents/doc-1/reject')
      .set('Authorization', makeToken('COMPLIANCE_OFFICER'))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Delete — always 403
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/documents/:id', () => {
  it('always returns 403', async () => {
    const res = await request(app)
      .delete('/api/v1/documents/doc-1')
      .set('Authorization', makeToken('SUPER_ADMIN'));

    expect(res.status).toBe(403);
  });

  it('returns 403 even for COMPLIANCE_OFFICER', async () => {
    const res = await request(app)
      .delete('/api/v1/documents/doc-1')
      .set('Authorization', makeToken('COMPLIANCE_OFFICER'));

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

describe('GET /api/v1/documents/transactions/:transactionId/checklist', () => {
  it('returns checklist for current phase', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      phase: 'PHASE_3',
      documents: [
        { id: 'doc-1', documentType: 'MINING_LICENCE', approvalStatus: 'APPROVED' },
        { id: 'doc-2', documentType: 'EXPORT_PERMIT', approvalStatus: 'PENDING' },
      ],
    });

    const res = await request(app)
      .get('/api/v1/documents/transactions/txn-1/checklist')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data.phase).toBe('PHASE_3');
    expect(res.body.data.complete).toBe(false);
    const items: Array<{ documentType: string; status: string }> = res.body.data.items;
    const mineLicence = items.find((i) => i.documentType === 'MINING_LICENCE');
    expect(mineLicence?.status).toBe('APPROVED');
  });

  it('returns complete=true when all phase docs approved', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue({
      phase: 'PHASE_2',
      documents: [
        { id: 'doc-1', documentType: 'BANK_INSTRUCTION_LETTER', approvalStatus: 'APPROVED' },
      ],
    });

    const res = await request(app)
      .get('/api/v1/documents/transactions/txn-1/checklist')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data.complete).toBe(true);
  });

  it('returns 404 for unknown transaction', async () => {
    const { db } = getMocks();
    db.prisma.transaction.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/documents/transactions/unknown/checklist')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Generate system document
// ---------------------------------------------------------------------------

describe('POST /api/v1/documents/transactions/:transactionId/generate', () => {
  it('generates a COMMERCIAL_INVOICE', async () => {
    const { genSvc } = getMocks();
    genSvc.generateSystemDocument.mockResolvedValue({
      id: 'doc-gen-1',
      storageKey: 'key/invoice.pdf',
    });

    const res = await request(app)
      .post('/api/v1/documents/transactions/txn-1/generate')
      .set('Authorization', makeToken('COMPLIANCE_OFFICER'))
      .send({ documentType: 'COMMERCIAL_INVOICE' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('doc-gen-1');
    expect(genSvc.generateSystemDocument).toHaveBeenCalledWith(
      'txn-1',
      { documentType: 'COMMERCIAL_INVOICE' },
      'user-1',
    );
  });

  it('returns 400 for unsupported document type', async () => {
    const res = await request(app)
      .post('/api/v1/documents/transactions/txn-1/generate')
      .set('Authorization', makeToken('COMPLIANCE_OFFICER'))
      .send({ documentType: 'MINING_LICENCE' });

    expect(res.status).toBe(400);
  });

  it('returns 403 for OPERATIONS role', async () => {
    const res = await request(app)
      .post('/api/v1/documents/transactions/txn-1/generate')
      .set('Authorization', makeToken('OPERATIONS'))
      .send({ documentType: 'COMMERCIAL_INVOICE' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

describe('GET /api/v1/documents/transactions/:transactionId/bundle', () => {
  it('streams a ZIP archive', async () => {
    const { bundleSvc } = getMocks();
    bundleSvc.bundleTransactionDocuments.mockImplementation(
      (_id: string, _actor: unknown, res: import('express').Response) => {
        res.setHeader('Content-Type', 'application/zip');
        res.end(Buffer.from('PK\x03\x04'));
      },
    );

    const res = await request(app)
      .get('/api/v1/documents/transactions/txn-1/bundle')
      .set('Authorization', makeToken('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('zip');
    expect(bundleSvc.bundleTransactionDocuments).toHaveBeenCalled();
  });
});
