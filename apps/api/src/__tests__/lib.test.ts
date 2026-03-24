/**
 * Unit tests for lib utilities
 * Covers: fx.service.ts, s3.ts, mailer.ts
 */

// ── Module mocks (hoisted before imports) ──────────────────────────────────

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn().mockImplementation((p: unknown) => ({ _cmd: 'put', ...Object(p) })),
  HeadObjectCommand: jest.fn().mockImplementation((p: unknown) => ({ _cmd: 'head', ...Object(p) })),
  GetObjectCommand: jest.fn().mockImplementation((p: unknown) => ({ _cmd: 'get', ...Object(p) })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));

// Axios: must use __esModule + default so ts-jest's CJS interop works
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('@aop/utils', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  NotFoundError: class NotFoundError extends Error {},
  ValidationError: class ValidationError extends Error {},
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import axios from 'axios';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import nodemailer from 'nodemailer';

import { getDailyRates, convertAmountToUsd, convertToUsd } from '../lib/fx.service';
import {
  s3Client,
  uploadToS3,
  getObjectSizeBytes,
  getObjectBytes,
  getSignedDownloadUrl,
} from '../lib/s3';
import { redis } from '../lib/redis';

// Typed mock helpers
const mockAxiosGet = axios.get as jest.Mock;
const mockGetSignedUrl = getSignedUrl as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockCreateTransport = nodemailer.createTransport as jest.Mock;
const mockRedisGet = redis.get as jest.Mock;
const mockRedisSet = redis.set as jest.Mock;

// ── fx.service ──────────────────────────────────────────────────────────────

describe('fx.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPEN_EXCHANGE_RATES_APP_ID;
  });

  describe('getDailyRates', () => {
    it('returns cached rates from Redis when available', async () => {
      const cached = { base: 'USD', date: '2026-03-22', rates: { ZAR: 18.5 } };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await getDailyRates('2026-03-22');

      expect(result).toEqual(cached);
      expect(mockRedisGet).toHaveBeenCalledWith('fx:rates:2026-03-22');
    });

    it('returns mock provider rates on cache miss (NODE_ENV=test uses MockFxRateProvider)', async () => {
      // In test mode, MockFxRateProvider is always selected — no axios call
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisSet.mockResolvedValueOnce('OK');

      const result = await getDailyRates('2026-03-22');

      expect(result.date).toBe('2026-03-22');
      expect(typeof result.rates['UGX']).toBe('number');
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('caches provider result in Redis after cache miss', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisSet.mockResolvedValueOnce('OK');

      await getDailyRates('2026-03-22');

      expect(mockRedisSet).toHaveBeenCalledWith(
        'fx:rates:2026-03-22',
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });

    it('continues when Redis read throws — falls through to provider', async () => {
      mockRedisGet.mockRejectedValueOnce(new Error('Redis down'));
      mockRedisSet.mockResolvedValueOnce('OK');

      const result = await getDailyRates('2026-03-22');
      // Should still return rates from the mock provider
      expect(result.rates).toBeDefined();
    });

    it('continues when Redis write throws after provider fetch', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisSet.mockRejectedValueOnce(new Error('Redis write error'));

      const result = await getDailyRates('2026-03-22');
      expect(result.rates).toBeDefined();
    });

    it('uses today as default date when no date provided', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      await getDailyRates();

      const today = new Date().toISOString().split('T')[0];
      expect(mockRedisGet).toHaveBeenCalledWith(`fx:rates:${today}`);
    });
  });

  describe('convertAmountToUsd', () => {
    it('returns amount unchanged for USD', () => {
      const result = convertAmountToUsd(100, 'USD', { EUR: 0.92 });
      expect(result).toEqual({ amountUsd: 100, fxRate: 1.0 });
    });

    it('converts amount using rate from map', () => {
      const result = convertAmountToUsd(18.5, 'ZAR', { ZAR: 18.5 });
      expect(result.amountUsd).toBeCloseTo(1.0, 5);
      expect(result.fxRate).toBe(18.5);
    });

    it('falls back to 1.0 when currency not in rates map', () => {
      const result = convertAmountToUsd(100, 'XYZ', { EUR: 0.92 });
      expect(result).toEqual({ amountUsd: 100, fxRate: 1.0 });
    });
  });

  describe('convertToUsd', () => {
    it('returns USD amount directly without fetching rates', async () => {
      const result = await convertToUsd(500, 'USD');
      expect(result).toEqual({ amountUsd: 500, fxRate: 1.0 });
      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('fetches rates and converts non-USD currency', async () => {
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({ base: 'USD', date: '2026-03-22', rates: { ZAR: 18.5 } }),
      );

      const result = await convertToUsd(185, 'ZAR');
      expect(result.amountUsd).toBeCloseTo(10.0, 2);
      expect(result.fxRate).toBe(18.5);
    });
  });
});

// ── s3 ───────────────────────────────────────────────────────────────────────

describe('s3', () => {
  // s3Client is the exported singleton from s3.ts; its `send` is a jest.fn() from the mock factory.
  // Access via the imported value so we don't depend on mock.instances tracking.
  const s3SendMock = s3Client.send as jest.Mock;

  beforeEach(() => {
    s3SendMock.mockReset();
    mockGetSignedUrl.mockReset();
  });

  describe('uploadToS3', () => {
    it('uploads buffer and returns storageKey and S3 url', async () => {
      s3SendMock.mockResolvedValueOnce({});
      delete process.env.MINIO_ENDPOINT;

      const result = await uploadToS3('reports/test.pdf', Buffer.from('data'), 'application/pdf');

      expect(result.storageKey).toBe('reports/test.pdf');
      expect(result.url).toContain('reports/test.pdf');
    });

    it('returns MinIO URL when MINIO_ENDPOINT env var is set', async () => {
      // uploadToS3 reads MINIO_ENDPOINT at call time (not module init time)
      process.env.MINIO_ENDPOINT = 'http://localhost:9000';
      s3SendMock.mockResolvedValueOnce({});

      const result = await uploadToS3('docs/file.pdf', Buffer.from('x'), 'application/pdf');

      expect(result.url).toBe('http://localhost:9000/aop-documents/docs/file.pdf');
      delete process.env.MINIO_ENDPOINT;
    });
  });

  describe('getObjectSizeBytes', () => {
    it('returns ContentLength from HeadObject response', async () => {
      s3SendMock.mockResolvedValueOnce({ ContentLength: 2048 });

      const size = await getObjectSizeBytes('reports/test.pdf');
      expect(size).toBe(2048);
    });

    it('returns 0 when ContentLength is absent', async () => {
      s3SendMock.mockResolvedValueOnce({});

      const size = await getObjectSizeBytes('reports/test.pdf');
      expect(size).toBe(0);
    });
  });

  describe('getObjectBytes', () => {
    it('returns file contents as Buffer from async iterable body', async () => {
      const chunk = Buffer.from('hello world');
      async function* fakeStream() {
        yield chunk;
      }
      s3SendMock.mockResolvedValueOnce({ Body: fakeStream() });

      const result = await getObjectBytes('reports/test.pdf');
      expect(result.toString()).toBe('hello world');
    });

    it('returns empty Buffer when Body is absent', async () => {
      s3SendMock.mockResolvedValueOnce({ Body: null });

      const result = await getObjectBytes('reports/test.pdf');
      expect(result.length).toBe(0);
    });
  });

  describe('getSignedDownloadUrl', () => {
    it('returns a presigned URL with default expiry', async () => {
      mockGetSignedUrl.mockResolvedValueOnce('https://signed.url/test.pdf?token=abc');

      const url = await getSignedDownloadUrl('reports/test.pdf');
      expect(url).toBe('https://signed.url/test.pdf?token=abc');
      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('passes custom expiry to presigner', async () => {
      mockGetSignedUrl.mockResolvedValueOnce('https://signed.url/test.pdf');

      const url = await getSignedDownloadUrl('reports/test.pdf', 7 * 24 * 3600);
      expect(url).toBe('https://signed.url/test.pdf');
      // Third arg to getSignedUrl should include expiresIn
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 7 * 24 * 3600 }),
      );
    });
  });
});

// ── mailer (legacy shim) ─────────────────────────────────────────────────────
//
// mailer.ts is now a thin shim over email.service.ts which delegates to the
// IEmailProvider adapter. In NODE_ENV=test the MockEmailProvider is selected,
// so sendMail completes without error and logs via the mock provider.

jest.mock('../lib/integrations/email/factory', () => ({
  getEmailProvider: jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue({ messageId: 'mock-123', status: 'MOCK' }),
  }),
  _resetEmailProvider: jest.fn(),
}));

jest.mock('@aop/db', () => ({
  prisma: { emailLog: { create: jest.fn().mockResolvedValue({}) } },
}));

describe('mailer (sendMail shim)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves without throwing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { sendMail } = require('../lib/mailer');
    await expect(
      sendMail({ to: 'user@example.com', subject: 'Hi', text: 'Hello' }),
    ).resolves.toBeUndefined();
  });

  it('resolves without throwing for an array of recipients', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { sendMail } = require('../lib/mailer');
    await expect(
      sendMail({ to: ['a@b.com', 'c@d.com'], subject: 'Multi', text: 'Body' }),
    ).resolves.toBeUndefined();
  });

  it('resolves without throwing when attachment is provided', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { sendMail } = require('../lib/mailer');
    await expect(
      sendMail({
        to: 'user@example.com',
        subject: 'Report',
        text: 'See attached',
        attachments: [
          { filename: 'r.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' },
        ],
      }),
    ).resolves.toBeUndefined();
  });
});
