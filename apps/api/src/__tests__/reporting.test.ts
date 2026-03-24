import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    regulatoryReport: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    client: { findMany: jest.fn() },
    systemSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    reportDeliveryLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('puppeteer', () => ({
  default: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent: jest.fn(),
        pdf: jest.fn().mockResolvedValue(Buffer.from([37, 80, 68, 70])),
      }),
      close: jest.fn(),
    }),
  },
}));

jest.mock('docx', () => ({
  Document: jest.fn(),
  Packer: { toBuffer: jest.fn().mockResolvedValue(Buffer.from('docx')) },
  Paragraph: jest.fn(),
  TextRun: jest.fn(),
  HeadingLevel: {},
  Table: jest.fn(),
  TableRow: jest.fn(),
  TableCell: jest.fn(),
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

jest.mock('../lib/s3', () => ({
  uploadToS3: jest.fn().mockResolvedValue({
    storageKey: 'reports/test/1234.pdf',
    url: 'https://s3.example.com/test.pdf',
  }),
  getSignedDownloadUrl: jest.fn().mockResolvedValue('https://s3.example.com/signed-url'),
  getObjectSizeBytes: jest.fn().mockResolvedValue(1024 * 100), // 100 KB by default
  getObjectBytes: jest.fn().mockResolvedValue(Buffer.from('PDF content')),
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
      regulatoryReport: {
        findMany: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
      };
      transaction: { findMany: jest.Mock; findUnique: jest.Mock };
      client: { findMany: jest.Mock };
      systemSettings: { findUnique: jest.Mock; upsert: jest.Mock };
      user: { findMany: jest.Mock; findFirst: jest.Mock };
      reportDeliveryLog: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
      auditEvent: { create: jest.Mock };
    };
  };
  return db.prisma;
}

const adminToken = () =>
  jwtLib.signAccessToken({ id: 'admin-1', email: 'admin@aop.local', role: 'ADMIN' });

const complianceToken = () =>
  jwtLib.signAccessToken({ id: 'co-1', email: 'co@aop.local', role: 'COMPLIANCE_OFFICER' });

const viewerToken = () =>
  jwtLib.signAccessToken({ id: 'viewer-1', email: 'viewer@aop.local', role: 'VIEWER' });

const baseReport = {
  id: 'report-1',
  reportType: 'MONTHLY_TRANSACTION',
  status: 'GENERATING',
  periodStart: new Date('2026-01-01'),
  periodEnd: new Date('2026-01-31'),
  generatedBy: 'admin-1',
  generatedAt: new Date(),
  storageKey: null,
  filePath: null,
  submittedAt: null,
  submittedBy: null,
  notes: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Unit tests: assembleOecdData
// ---------------------------------------------------------------------------

describe('assembleOecdData (unit)', () => {
  // We import after mocks are set up to avoid module resolution issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { assembleOecdData } = require('../modules/reporting/generators/oecd-due-diligence');

  const makeTx = (overrides: Record<string, unknown> = {}) => ({
    id: 'tx-1',
    countryCode: 'UG',
    lmePriceLocked: { valueOf: () => 2000 } as unknown as { valueOf: () => number },
    goldWeightFine: { valueOf: () => 100 } as unknown as { valueOf: () => number },
    createdAt: new Date(),
    client: {
      isPEP: false,
      isEDD: false,
      sanctionsStatus: 'CLEAR',
      riskRating: 'MEDIUM',
    },
    ...overrides,
  });

  it('groups transactions by country', () => {
    const transactions = [
      makeTx({ id: 'tx-1', countryCode: 'UG' }),
      makeTx({ id: 'tx-2', countryCode: 'UG' }),
      makeTx({ id: 'tx-3', countryCode: 'KE' }),
    ];
    const result = assembleOecdData(
      transactions,
      [],
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    const ugEntry = result.byCountry.find((c: { countryCode: string }) => c.countryCode === 'UG');
    const keEntry = result.byCountry.find((c: { countryCode: string }) => c.countryCode === 'KE');
    expect(ugEntry?.transactionCount).toBe(2);
    expect(keEntry?.transactionCount).toBe(1);
  });

  it('identifies PEP red flag incidents', () => {
    const transactions = [
      makeTx({
        id: 'tx-pep',
        client: { isPEP: true, isEDD: false, sanctionsStatus: 'CLEAR', riskRating: 'HIGH' },
      }),
      makeTx({ id: 'tx-clean' }),
    ];
    const result = assembleOecdData(
      transactions,
      [],
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(result.redFlagIncidents).toHaveLength(1);
    expect(result.redFlagIncidents[0].transactionId).toBe('tx-pep');
    expect(result.redFlagIncidents[0].reason).toContain('PEP');
  });

  it('identifies sanctions hit incidents', () => {
    const transactions = [
      makeTx({
        id: 'tx-sanctions',
        client: { isPEP: false, isEDD: false, sanctionsStatus: 'HIT', riskRating: 'HIGH' },
      }),
    ];
    const result = assembleOecdData(
      transactions,
      [],
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(result.redFlagIncidents).toHaveLength(1);
    expect(result.redFlagIncidents[0].reason).toContain('Sanctions hit');
  });

  it('returns empty red flags when no incidents', () => {
    const transactions = [makeTx()];
    const result = assembleOecdData(
      transactions,
      [],
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );
    expect(result.redFlagIncidents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: populateStrTemplate
// ---------------------------------------------------------------------------

describe('populateStrTemplate (unit)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { populateStrTemplate } = require('../modules/reporting/generators/str-draft');

  const baseTx = {
    id: 'tx-str-1',
    countryCode: 'UG',
    phase: 'PHASE_3',
    status: 'ACTIVE',
    goldWeightGross: 500,
    goldWeightFine: 450,
    lmePriceLocked: 2000,
    createdAt: new Date('2026-01-15'),
    client: {
      fullName: 'John Doe',
      entityType: 'INDIVIDUAL',
      countryCode: 'UG',
      kycStatus: 'APPROVED',
      sanctionsStatus: 'CLEAR',
      riskRating: 'MEDIUM',
      isPEP: false,
      isEDD: false,
    },
  };

  const baseClient = {
    fullName: 'John Doe',
    entityType: 'INDIVIDUAL',
    countryCode: 'UG',
    kycStatus: 'APPROVED',
    sanctionsStatus: 'CLEAR',
    riskRating: 'MEDIUM',
    isPEP: false,
    isEDD: false,
  };

  it('populates Part A with reporting institution details', () => {
    const result = populateStrTemplate(baseTx, baseClient);
    expect(result.partA.reportingInstitution).toBe('Aurum Gold Finance Ltd');
    expect(result.partA.referenceNumber).toContain('STR-tx-str-1');
  });

  it('populates Part B with client information', () => {
    const result = populateStrTemplate(baseTx, baseClient);
    expect(result.partB.subjectName).toBe('John Doe');
    expect(result.partB.entityType).toBe('INDIVIDUAL');
    expect(result.partB.nationality).toBe('UG');
  });

  it('populates Part C with activity description', () => {
    const result = populateStrTemplate(baseTx, baseClient);
    expect(result.partC.activityDescription).toContain('tx-str-1');
    expect(result.partC.locationOfActivity).toBe('UG');
  });

  it('populates Part D with financial details', () => {
    const result = populateStrTemplate(baseTx, baseClient);
    expect(result.partD.transactionId).toBe('tx-str-1');
    expect(result.partD.transactionPhase).toBe('PHASE_3');
    expect(result.partD.currency).toBe('USD');
  });

  it('flags PEP clients as suspicious indicators', () => {
    const pepClient = { ...baseClient, isPEP: true };
    const result = populateStrTemplate({ ...baseTx, client: pepClient }, pepClient);
    expect(result.partC.suspiciousIndicators).toContain(
      'Client is a Politically Exposed Person (PEP)',
    );
  });

  it('flags sanctions hits as suspicious indicators', () => {
    const sanctionsClient = { ...baseClient, sanctionsStatus: 'HIT' };
    const result = populateStrTemplate({ ...baseTx, client: sanctionsClient }, sanctionsClient);
    expect(result.partC.suspiciousIndicators).toContain('Client has a sanctions screening hit');
  });

  it('returns empty suspicious indicators for clean client', () => {
    const result = populateStrTemplate(baseTx, baseClient);
    expect(result.partC.suspiciousIndicators).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// HTTP integration tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/reports', () => {
  it('returns empty list for ADMIN', async () => {
    const db = getMocks();
    db.regulatoryReport.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/reports')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('returns reports list', async () => {
    const db = getMocks();
    db.regulatoryReport.findMany.mockResolvedValue([baseReport]);

    const res = await request(app)
      .get('/api/v1/reports')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/reports');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/reports/generate', () => {
  it('creates a report with GENERATING status and returns 201', async () => {
    const db = getMocks();
    db.regulatoryReport.create.mockResolvedValue(baseReport);

    const res = await request(app)
      .post('/api/v1/reports/generate')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({
        reportType: 'MONTHLY_TRANSACTION',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-01-31T23:59:59.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('GENERATING');
    expect(db.regulatoryReport.create).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for invalid reportType', async () => {
    const res = await request(app)
      .post('/api/v1/reports/generate')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({ reportType: 'INVALID_TYPE' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for VIEWER role', async () => {
    const res = await request(app)
      .post('/api/v1/reports/generate')
      .set('Authorization', `Bearer ${viewerToken()}`)
      .send({ reportType: 'MONTHLY_TRANSACTION' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/reports/:id', () => {
  it('returns 404 for non-existent report', async () => {
    const db = getMocks();
    db.regulatoryReport.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/reports/nonexistent-id')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns report when found', async () => {
    const db = getMocks();
    db.regulatoryReport.findUnique.mockResolvedValue(baseReport);

    const res = await request(app)
      .get('/api/v1/reports/report-1')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('report-1');
  });
});

describe('POST /api/v1/reports/:id/submit', () => {
  it('returns 400 when report is not READY', async () => {
    const db = getMocks();
    db.regulatoryReport.findUnique.mockResolvedValue({ ...baseReport, status: 'GENERATING' });

    const res = await request(app)
      .post('/api/v1/reports/report-1/submit')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when report is FAILED', async () => {
    const db = getMocks();
    db.regulatoryReport.findUnique.mockResolvedValue({ ...baseReport, status: 'FAILED' });

    const res = await request(app)
      .post('/api/v1/reports/report-1/submit')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(400);
  });

  it('submits a READY report successfully', async () => {
    const db = getMocks();
    const readyReport = { ...baseReport, status: 'READY', storageKey: 'reports/test/1.pdf' };
    db.regulatoryReport.findUnique.mockResolvedValue(readyReport);
    db.regulatoryReport.update.mockResolvedValue({
      ...readyReport,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      submittedBy: 'co-1',
    });

    const res = await request(app)
      .post('/api/v1/reports/report-1/submit')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(200);
    expect(db.regulatoryReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'report-1' },
        data: expect.objectContaining({ status: 'SUBMITTED' }),
      }),
    );
  });

  it('returns 403 for ADMIN trying to submit', async () => {
    const res = await request(app)
      .post('/api/v1/reports/report-1/submit')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/reports/suspicious-transactions', () => {
  it('returns suspicious transactions for COMPLIANCE_OFFICER', async () => {
    const db = getMocks();
    db.transaction.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/reports/suspicious-transactions')
      .set('Authorization', `Bearer ${complianceToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 403 for VIEWER role', async () => {
    const res = await request(app)
      .get('/api/v1/reports/suspicious-transactions')
      .set('Authorization', `Bearer ${viewerToken()}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 for ADMIN role', async () => {
    const res = await request(app)
      .get('/api/v1/reports/suspicious-transactions')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/reports/schedule', () => {
  it('returns schedule for ADMIN', async () => {
    const db = getMocks();
    db.systemSettings.findUnique.mockResolvedValue({
      key: 'REPORT_SCHEDULE',
      value: [
        {
          reportType: 'MONTHLY_TRANSACTION',
          cronExpression: '0 3 1 * *',
          recipients: ['co@aop.local'],
          enabled: true,
        },
      ],
    });

    const res = await request(app)
      .get('/api/v1/reports/schedule')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns empty array when no schedule configured', async () => {
    const db = getMocks();
    db.systemSettings.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/reports/schedule')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('PUT /api/v1/reports/schedule', () => {
  it('updates schedule as SUPER_ADMIN', async () => {
    const superToken = jwtLib.signAccessToken({
      id: 'sa-1',
      email: 'sa@aop.local',
      role: 'SUPER_ADMIN',
    });
    const db = getMocks();
    db.systemSettings.findUnique.mockResolvedValue(null);
    db.systemSettings.upsert.mockResolvedValue({});

    const res = await request(app)
      .put('/api/v1/reports/schedule')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        reportType: 'MONTHLY_TRANSACTION',
        cronExpression: '0 3 1 * *',
        recipients: ['co@aop.local'],
        enabled: true,
      });

    expect(res.status).toBe(200);
    expect(db.systemSettings.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns 403 for COMPLIANCE_OFFICER', async () => {
    const res = await request(app)
      .put('/api/v1/reports/schedule')
      .set('Authorization', `Bearer ${complianceToken()}`)
      .send({
        reportType: 'MONTHLY_TRANSACTION',
        cronExpression: '0 3 1 * *',
        recipients: ['co@aop.local'],
      });

    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid email in recipients', async () => {
    const superToken = jwtLib.signAccessToken({
      id: 'sa-1',
      email: 'sa@aop.local',
      role: 'SUPER_ADMIN',
    });

    const res = await request(app)
      .put('/api/v1/reports/schedule')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        reportType: 'MONTHLY_TRANSACTION',
        cronExpression: '0 3 1 * *',
        recipients: ['not-an-email'],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: ReportDeliveryService
// ---------------------------------------------------------------------------

describe('deliverReport (unit)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const deliveryModule = require('../modules/reporting/report-delivery.service');

  const s3Mocks = jest.requireMock('../lib/s3') as {
    getObjectSizeBytes: jest.Mock;
    getObjectBytes: jest.Mock;
    getSignedDownloadUrl: jest.Mock;
  };
  const mailerMock = jest.requireMock('../lib/mailer') as { sendMail: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: 100 KB file (< 10 MB) → should attach
    s3Mocks.getObjectSizeBytes.mockResolvedValue(100 * 1024);
    s3Mocks.getObjectBytes.mockResolvedValue(Buffer.from('PDF content'));
    mailerMock.sendMail.mockResolvedValue(undefined);
  });

  it('skips delivery when no recipients configured', async () => {
    const db = getMocks();
    db.systemSettings.findUnique.mockResolvedValue(null);

    await deliveryModule.deliverReport('report-1', 'MONTHLY_TRANSACTION', 'reports/test/1.pdf');

    expect(db.reportDeliveryLog.create).not.toHaveBeenCalled();
    expect(mailerMock.sendMail).not.toHaveBeenCalled();
  });

  it('delivers with attachment when file < 10 MB', async () => {
    const db = getMocks();
    db.systemSettings.findUnique.mockResolvedValue({
      key: 'REPORT_SCHEDULE',
      value: [
        {
          reportType: 'MONTHLY_TRANSACTION',
          cronExpression: '0 3 1 * *',
          recipients: ['co@aop.local'],
          enabled: true,
        },
      ],
    });
    db.reportDeliveryLog.create.mockResolvedValue({ id: 'log-1' });
    db.reportDeliveryLog.update.mockResolvedValue({});

    await deliveryModule.deliverReport('report-1', 'MONTHLY_TRANSACTION', 'reports/test/1.pdf');

    expect(mailerMock.sendMail).toHaveBeenCalledTimes(1);
    const mailCall = mailerMock.sendMail.mock.calls[0][0] as { attachments?: unknown[] };
    expect(mailCall.attachments).toBeDefined();
    expect(mailCall.attachments).toHaveLength(1);
    expect(db.reportDeliveryLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryStatus: 'SENT' }),
      }),
    );
  });

  it('sends link when file exceeds 10 MB', async () => {
    const db = getMocks();
    s3Mocks.getObjectSizeBytes.mockResolvedValue(15 * 1024 * 1024); // 15 MB
    db.systemSettings.findUnique.mockResolvedValue({
      key: 'REPORT_SCHEDULE',
      value: [
        {
          reportType: 'MONTHLY_TRANSACTION',
          cronExpression: '0 3 1 * *',
          recipients: ['co@aop.local'],
          enabled: true,
        },
      ],
    });
    db.reportDeliveryLog.create.mockResolvedValue({ id: 'log-1' });
    db.reportDeliveryLog.update.mockResolvedValue({});

    await deliveryModule.deliverReport('report-1', 'MONTHLY_TRANSACTION', 'reports/test/big.pdf');

    expect(mailerMock.sendMail).toHaveBeenCalledTimes(1);
    const mailCall = mailerMock.sendMail.mock.calls[0][0] as {
      text: string;
      attachments?: unknown[];
    };
    expect(mailCall.text).toContain('https://s3.example.com/signed-url');
    expect(mailCall.attachments).toBeUndefined();
  });

  it('retries on failure and marks log FAILED after 3 attempts', async () => {
    const db = getMocks();
    db.systemSettings.findUnique.mockResolvedValue({
      key: 'REPORT_SCHEDULE',
      value: [
        {
          reportType: 'MONTHLY_TRANSACTION',
          cronExpression: '0 3 1 * *',
          recipients: ['co@aop.local'],
          enabled: true,
        },
      ],
    });
    db.reportDeliveryLog.create.mockResolvedValue({ id: 'log-1' });
    db.reportDeliveryLog.update.mockResolvedValue({});
    db.user.findMany.mockResolvedValue([{ email: 'admin@aop.local' }]);
    mailerMock.sendMail.mockRejectedValue(new Error('SMTP timeout'));

    await deliveryModule.deliverReport('report-1', 'MONTHLY_TRANSACTION', 'reports/test/1.pdf');

    expect(db.reportDeliveryLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryStatus: 'FAILED', attempts: 3 }),
      }),
    );
  }, 15000);

  it('alerts admins after final delivery failure', async () => {
    const db = getMocks();
    db.systemSettings.findUnique.mockResolvedValue({
      key: 'REPORT_SCHEDULE',
      value: [
        {
          reportType: 'MONTHLY_TRANSACTION',
          cronExpression: '0 3 1 * *',
          recipients: ['co@aop.local'],
          enabled: true,
        },
      ],
    });
    db.reportDeliveryLog.create.mockResolvedValue({ id: 'log-1' });
    db.reportDeliveryLog.update.mockResolvedValue({});
    db.user.findMany.mockResolvedValue([{ email: 'admin@aop.local' }]);
    mailerMock.sendMail.mockRejectedValue(new Error('Connection refused'));

    await deliveryModule.deliverReport('report-1', 'MONTHLY_TRANSACTION', 'reports/test/1.pdf');

    // sendMail called 3 times (delivery attempts) + 1 admin alert
    expect(mailerMock.sendMail.mock.calls.length).toBeGreaterThanOrEqual(4);
    const adminAlertCall = mailerMock.sendMail.mock.calls.at(-1)![0] as { subject: string };
    expect(adminAlertCall.subject).toContain('Report Delivery Failed');
  }, 15000);

  it('only delivers to enabled schedule entries', async () => {
    const db = getMocks();
    db.systemSettings.findUnique.mockResolvedValue({
      key: 'REPORT_SCHEDULE',
      value: [
        {
          reportType: 'MONTHLY_TRANSACTION',
          cronExpression: '0 3 1 * *',
          recipients: ['co@aop.local'],
          enabled: false, // disabled
        },
      ],
    });

    await deliveryModule.deliverReport('report-1', 'MONTHLY_TRANSACTION', 'reports/test/1.pdf');

    expect(db.reportDeliveryLog.create).not.toHaveBeenCalled();
    expect(mailerMock.sendMail).not.toHaveBeenCalled();
  });
});
