/**
 * Unit tests for all external service adapters.
 * All network calls are mocked — no real HTTP requests are made.
 */

// ── Module mocks (hoisted before imports) ──────────────────────────────────

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  SendEmailCommand: jest.fn().mockImplementation((p: unknown) => ({ _cmd: 'send', ...Object(p) })),
  SendRawEmailCommand: jest
    .fn()
    .mockImplementation((p: unknown) => ({ _cmd: 'sendRaw', ...Object(p) })),
}));

jest.mock('@aop/utils', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  NotFoundError: class NotFoundError extends Error {
    constructor(r: string, id?: string) {
      super(`${r}${id ? ` ${id}` : ''} not found`);
    }
  },
  ExternalServiceError: class ExternalServiceError extends Error {
    statusCode = 502;
    code = 'EXTERNAL_SERVICE_ERROR';
    constructor(service: string, msg: string, _details?: unknown) {
      super(`External service error [${service}]: ${msg}`);
    }
  },
}));

jest.mock('@aop/db', () => ({
  prisma: {
    emailLog: { create: jest.fn().mockResolvedValue({}) },
    fxRate: { upsert: jest.fn().mockResolvedValue({}) },
    client: { findUnique: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import axios from 'axios';

import { ComplyAdvantageSanctionsProvider } from '../lib/integrations/sanctions/live';
import { MockSanctionsProvider } from '../lib/integrations/sanctions/mock';
import {
  getSanctionsProvider,
  _resetSanctionsProvider,
} from '../lib/integrations/sanctions/factory';

import { OpenExchangeRatesProvider } from '../lib/integrations/fx/live';
import { MockFxRateProvider } from '../lib/integrations/fx/mock';
import { getFxRateProvider, _resetFxRateProvider } from '../lib/integrations/fx/factory';

import { MockEmailProvider } from '../lib/integrations/email/mock';
import { getEmailProvider, _resetEmailProvider } from '../lib/integrations/email/factory';

import { MockSmsProvider } from '../lib/integrations/sms/mock';
import { getSmsProvider, _resetSmsProvider } from '../lib/integrations/sms/factory';

const mockAxiosPost = axios.post as jest.Mock;
const mockAxiosGet = axios.get as jest.Mock;

// ═══════════════════════════════════════════════════════════════════════════
// SANCTIONS — Mock Provider
// ═══════════════════════════════════════════════════════════════════════════

describe('MockSanctionsProvider', () => {
  const provider = new MockSanctionsProvider();

  it('returns CLEAR for a normal name', async () => {
    const result = await provider.search({ name: 'Alice Johnson', entityType: 'person' });
    expect(result.outcome).toBe('CLEAR');
    expect(result.rawResult.mock).toBe(true);
  });

  it('returns HIT when name contains BLOCKED', async () => {
    const result = await provider.search({ name: 'BLOCKED Corp Ltd', entityType: 'company' });
    expect(result.outcome).toBe('HIT');
  });

  it('returns POSSIBLE_MATCH when name contains FLAGGED', async () => {
    const result = await provider.search({ name: 'FLAGGED Resources', entityType: 'company' });
    expect(result.outcome).toBe('POSSIBLE_MATCH');
  });

  it('is case-insensitive for blocked/flagged names', async () => {
    const r = await provider.search({ name: 'John Blocked Smith', entityType: 'person' });
    expect(r.outcome).toBe('HIT');
  });

  it('sets provider name to MockSanctions', async () => {
    const r = await provider.search({ name: 'Test Name', entityType: 'person' });
    expect(r.provider).toBe('MockSanctions');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SANCTIONS — Live Provider (ComplyAdvantage)
// ═══════════════════════════════════════════════════════════════════════════

describe('ComplyAdvantageSanctionsProvider', () => {
  const provider = new ComplyAdvantageSanctionsProvider('test-api-key');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns CLEAR when number_of_hits is 0', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: { content: { number_of_hits: 0, hits: [] } },
    });

    const result = await provider.search({ name: 'Alice Johnson', entityType: 'person' });
    expect(result.outcome).toBe('CLEAR');
    expect(result.provider).toBe('ComplyAdvantage');
  });

  it('returns HIT when a hit has match_status true_positive', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        content: {
          number_of_hits: 1,
          hits: [{ match_status: 'true_positive', match_types: ['sanction'] }],
        },
      },
    });

    const result = await provider.search({ name: 'Sanctioned Entity', entityType: 'company' });
    expect(result.outcome).toBe('HIT');
  });

  it('returns POSSIBLE_MATCH when hits exist but none are true_positive', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        content: {
          number_of_hits: 1,
          hits: [{ match_status: 'potential_match', match_types: ['warning'] }],
        },
      },
    });

    const result = await provider.search({ name: 'Fuzzy Match', entityType: 'person' });
    expect(result.outcome).toBe('POSSIBLE_MATCH');
  });

  it('sends the correct Authorization header', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: { content: { number_of_hits: 0, hits: [] } },
    });

    await provider.search({ name: 'Test', entityType: 'person' });

    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/v4/searches'),
      expect.objectContaining({ search_term: 'Test', fuzziness: 0.6 }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Token test-api-key',
        }),
      }),
    );
  });

  it('includes countryCode in filters when provided', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: { content: { number_of_hits: 0, hits: [] } },
    });

    await provider.search({ name: 'Test', entityType: 'person', countryCode: 'UG' });

    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        filters: expect.objectContaining({ country_codes: ['UG'] }),
      }),
      expect.any(Object),
    );
  });

  it('wraps non-429 errors as ExternalServiceError (502)', async () => {
    mockAxiosPost.mockRejectedValueOnce(
      Object.assign(new Error('Server error'), { response: { status: 500 } }),
    );

    await expect(provider.search({ name: 'Test', entityType: 'person' })).rejects.toThrow(
      'Sanctions screening request failed',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SANCTIONS — Factory
// ═══════════════════════════════════════════════════════════════════════════

describe('getSanctionsProvider factory', () => {
  beforeEach(() => {
    _resetSanctionsProvider();
  });

  afterEach(() => {
    _resetSanctionsProvider();
    delete process.env.SANCTIONS_API_KEY;
  });

  it('returns MockSanctionsProvider in test environment', () => {
    process.env.NODE_ENV = 'test';
    const p = getSanctionsProvider();
    expect(p).toBeInstanceOf(MockSanctionsProvider);
  });

  it('returns singleton — same instance on repeated calls', () => {
    const p1 = getSanctionsProvider();
    const p2 = getSanctionsProvider();
    expect(p1).toBe(p2);
  });

  it('returns ComplyAdvantageSanctionsProvider when API key present in non-test env', () => {
    _resetSanctionsProvider();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.SANCTIONS_API_KEY = 'live-key';

    const p = getSanctionsProvider();
    expect(p).toBeInstanceOf(ComplyAdvantageSanctionsProvider);

    process.env.NODE_ENV = originalEnv;
    _resetSanctionsProvider();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FX RATE — Mock Provider
// ═══════════════════════════════════════════════════════════════════════════

describe('MockFxRateProvider', () => {
  const provider = new MockFxRateProvider();

  it('returns hardcoded rates for all supported currencies', async () => {
    const data = await provider.getRates();
    expect(data.rates['UGX']).toBe(3_800);
    expect(data.rates['TZS']).toBe(2_600);
    expect(data.rates['KES']).toBe(130);
    expect(data.rates['ZAR']).toBe(18.5);
    expect(data.rates['EUR']).toBe(0.92);
    expect(data.rates['GBP']).toBe(0.79);
    expect(data.rates['AED']).toBe(3.67);
  });

  it('returns the specified date', async () => {
    const data = await provider.getRates('2026-03-23');
    expect(data.date).toBe('2026-03-23');
  });

  it('defaults to today when no date given', async () => {
    const today = new Date().toISOString().split('T')[0];
    const data = await provider.getRates();
    expect(data.date).toBe(today);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FX RATE — Live Provider (Open Exchange Rates)
// ═══════════════════════════════════════════════════════════════════════════

describe('OpenExchangeRatesProvider', () => {
  const provider = new OpenExchangeRatesProvider('test-app-id');

  beforeEach(() => jest.clearAllMocks());

  it('fetches rates and returns them with the given date', async () => {
    mockAxiosGet.mockResolvedValueOnce({
      data: { base: 'USD', timestamp: 1234567890, rates: { UGX: 3800, ZAR: 18.5 } },
    });

    const data = await provider.getRates('2026-03-23');

    expect(data.date).toBe('2026-03-23');
    expect(data.rates['UGX']).toBe(3800);
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('openexchangerates.org'),
      expect.objectContaining({ params: expect.objectContaining({ app_id: 'test-app-id' }) }),
    );
  });

  it('defaults date to today when not provided', async () => {
    const today = new Date().toISOString().split('T')[0];
    mockAxiosGet.mockResolvedValueOnce({
      data: { base: 'USD', timestamp: 0, rates: { EUR: 0.92 } },
    });

    const data = await provider.getRates();
    expect(data.date).toBe(today);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FX RATE — Factory
// ═══════════════════════════════════════════════════════════════════════════

describe('getFxRateProvider factory', () => {
  beforeEach(() => _resetFxRateProvider());
  afterEach(() => {
    _resetFxRateProvider();
    delete process.env.OPEN_EXCHANGE_RATES_APP_ID;
  });

  it('returns MockFxRateProvider in test environment', () => {
    process.env.NODE_ENV = 'test';
    const p = getFxRateProvider();
    expect(p).toBeInstanceOf(MockFxRateProvider);
  });

  it('returns singleton on repeated calls', () => {
    const p1 = getFxRateProvider();
    const p2 = getFxRateProvider();
    expect(p1).toBe(p2);
  });

  it('returns OpenExchangeRatesProvider when app ID present in non-test env', () => {
    _resetFxRateProvider();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.OPEN_EXCHANGE_RATES_APP_ID = 'live-app-id';

    const p = getFxRateProvider();
    expect(p).toBeInstanceOf(OpenExchangeRatesProvider);

    process.env.NODE_ENV = originalEnv;
    _resetFxRateProvider();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL — Mock Provider
// ═══════════════════════════════════════════════════════════════════════════

describe('MockEmailProvider', () => {
  const provider = new MockEmailProvider();

  it('returns MOCK status and a messageId', async () => {
    const result = await provider.send({
      to: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
      textBody: 'Hello',
    });

    expect(result.status).toBe('MOCK');
    expect(result.messageId).toMatch(/^mock-/);
  });

  it('accepts arrays for to field', async () => {
    const result = await provider.send({
      to: ['a@b.com', 'c@d.com'],
      subject: 'Multi',
      htmlBody: '<p>x</p>',
      textBody: 'x',
    });

    expect(result.status).toBe('MOCK');
  });

  it('handles attachments without throwing', async () => {
    const result = await provider.send({
      to: 'user@example.com',
      subject: 'With attachment',
      htmlBody: '<p>See attached</p>',
      textBody: 'See attached',
      attachments: [
        { filename: 'doc.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' },
      ],
    });

    expect(result.status).toBe('MOCK');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL — Factory
// ═══════════════════════════════════════════════════════════════════════════

describe('getEmailProvider factory', () => {
  beforeEach(() => _resetEmailProvider());
  afterEach(() => {
    _resetEmailProvider();
    delete process.env.SES_FROM_ADDRESS;
  });

  it('returns MockEmailProvider in test environment', () => {
    process.env.NODE_ENV = 'test';
    const p = getEmailProvider();
    expect(p).toBeInstanceOf(MockEmailProvider);
  });

  it('returns singleton on repeated calls', () => {
    const p1 = getEmailProvider();
    const p2 = getEmailProvider();
    expect(p1).toBe(p2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SMS — Mock Provider
// ═══════════════════════════════════════════════════════════════════════════

describe('MockSmsProvider', () => {
  const provider = new MockSmsProvider();

  it('returns MOCK status and a messageId', async () => {
    const result = await provider.send({ to: '+256700000000', body: 'Hello' });
    expect(result.status).toBe('MOCK');
    expect(result.messageId).toMatch(/^mock-sms-/);
  });

  it('includes cost of 0.0000', async () => {
    const result = await provider.send({ to: '+254700000000', body: 'Test' });
    expect(result.cost).toBe('0.0000');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SMS — Factory
// ═══════════════════════════════════════════════════════════════════════════

describe('getSmsProvider factory', () => {
  beforeEach(() => _resetSmsProvider());
  afterEach(() => {
    _resetSmsProvider();
    delete process.env.ENABLE_SMS;
    delete process.env.AT_USERNAME;
    delete process.env.AT_API_KEY;
  });

  it('returns MockSmsProvider when ENABLE_SMS is not set', () => {
    const p = getSmsProvider();
    expect(p).toBeInstanceOf(MockSmsProvider);
  });

  it('returns MockSmsProvider when ENABLE_SMS=true but credentials missing', () => {
    process.env.ENABLE_SMS = 'true';
    const p = getSmsProvider();
    expect(p).toBeInstanceOf(MockSmsProvider);
  });

  it('returns MockSmsProvider in test environment regardless of credentials', () => {
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_SMS = 'true';
    process.env.AT_USERNAME = 'user';
    process.env.AT_API_KEY = 'key';
    const p = getSmsProvider();
    expect(p).toBeInstanceOf(MockSmsProvider);
  });

  it('returns singleton on repeated calls', () => {
    const p1 = getSmsProvider();
    const p2 = getSmsProvider();
    expect(p1).toBe(p2);
  });
});
