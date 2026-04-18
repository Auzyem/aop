import request from 'supertest';
import { app } from '../app';
import * as jwtLib from '../lib/jwt';

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

jest.mock('@aop/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../lib/rate-limits', () => ({
  loginRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  totpRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  generalApiRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  documentUploadRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  sanctionsRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
  },
  setRefreshToken: jest.fn().mockResolvedValue(undefined),
  hasRefreshToken: jest.fn().mockResolvedValue(true),
  deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
  deleteAllUserTokens: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('speakeasy', () => ({
  totp: {
    verify: jest.fn(),
  },
  generateSecret: jest.fn(),
}));

jest.mock('@aop/utils', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  UnauthorizedError: class UnauthorizedError extends Error {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    constructor(msg: string) {
      super(msg);
      this.name = 'UnauthorizedError';
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ForbiddenError: class ForbiddenError extends Error {
    statusCode = 403;
    code = 'FORBIDDEN';
    constructor(msg: string) {
      super(msg);
      this.name = 'ForbiddenError';
    }
  },
  isAppError: (e: unknown) => e instanceof Error && 'statusCode' in e,
}));

// ---------------------------------------------------------------------------
// Typed mock accessors (avoid Prisma's complex generic types)
// ---------------------------------------------------------------------------

function getMocks() {
  const db = jest.requireMock('@aop/db') as { prisma: { user: { findUnique: jest.Mock } } };
  const redis = jest.requireMock('../lib/redis') as {
    setRefreshToken: jest.Mock;
    hasRefreshToken: jest.Mock;
    deleteRefreshToken: jest.Mock;
  };
  const bcrypt = jest.requireMock('bcryptjs') as { compare: jest.Mock };
  const speakeasy = jest.requireMock('speakeasy') as {
    totp: { verify: jest.Mock };
    generateSecret: jest.Mock;
  };
  return { db, redis, bcrypt, speakeasy };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseUser = {
  id: 'user-123',
  email: 'admin@aop.local',
  passwordHash: '$2b$10$hashed',
  isActive: true,
  role: 'ADMIN',
  agentId: null,
  twoFactorSecret: null,
  firstName: 'Admin',
  lastName: 'User',
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  const { redis } = getMocks();
  redis.setRefreshToken.mockResolvedValue(undefined);
  redis.hasRefreshToken.mockResolvedValue(true);
  redis.deleteRefreshToken.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/login', () => {
  it('returns tokens on valid credentials (no 2FA)', async () => {
    const { db, bcrypt } = getMocks();
    db.prisma.user.findUnique.mockResolvedValue(baseUser);
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@aop.local', password: 'Admin1234!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.requiresTOTP).toBe(false);
  });

  it('returns requiresTOTP:true when 2FA is set', async () => {
    const { db, bcrypt } = getMocks();
    db.prisma.user.findUnique.mockResolvedValue({ ...baseUser, twoFactorSecret: 'SECRET' });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@aop.local', password: 'Admin1234!' });

    expect(res.status).toBe(200);
    expect(res.body.data.requiresTOTP).toBe(true);
    expect(res.body.data).toHaveProperty('tempToken');
    expect(res.body.data).not.toHaveProperty('accessToken');
  });

  it('returns 401 for wrong password', async () => {
    const { db, bcrypt } = getMocks();
    db.prisma.user.findUnique.mockResolvedValue(baseUser);
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@aop.local', password: 'WrongPass!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for unknown email', async () => {
    const { db } = getMocks();
    db.prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@aop.local', password: 'Admin1234!' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for inactive user', async () => {
    const { db, bcrypt } = getMocks();
    db.prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@aop.local', password: 'Admin1234!' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for missing/invalid fields', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/totp/verify
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/totp/verify', () => {
  it('returns tokens on valid TOTP code', async () => {
    const { db, speakeasy, redis } = getMocks();
    const tempToken = jwtLib.signTempToken('user-123');
    db.prisma.user.findUnique.mockResolvedValue({ ...baseUser, twoFactorSecret: 'SECRET' });
    speakeasy.totp.verify.mockReturnValue(true);
    redis.setRefreshToken.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/auth/totp/verify')
      .send({ tempToken, code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('returns 401 for invalid TOTP code', async () => {
    const { db, speakeasy } = getMocks();
    const tempToken = jwtLib.signTempToken('user-123');
    db.prisma.user.findUnique.mockResolvedValue({ ...baseUser, twoFactorSecret: 'SECRET' });
    speakeasy.totp.verify.mockReturnValue(false);

    const res = await request(app)
      .post('/api/v1/auth/totp/verify')
      .send({ tempToken, code: '000000' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid/expired temp token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/totp/verify')
      .send({ tempToken: 'invalid.token.here', code: '123456' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/refresh
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/refresh', () => {
  it('rotates tokens on valid refresh token', async () => {
    const { db, redis } = getMocks();
    const { token: refreshToken } = jwtLib.signRefreshToken('user-123');
    redis.hasRefreshToken.mockResolvedValue(true);
    db.prisma.user.findUnique.mockResolvedValue(baseUser);

    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(redis.deleteRefreshToken).toHaveBeenCalledTimes(1);
    expect(redis.setRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when refresh token is revoked', async () => {
    const { redis } = getMocks();
    const { token: refreshToken } = jwtLib.signRefreshToken('user-123');
    redis.hasRefreshToken.mockResolvedValue(false);

    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid refresh token string', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'bad-token' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/logout
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/logout', () => {
  it('succeeds and revokes token', async () => {
    const { token: refreshToken } = jwtLib.signRefreshToken('user-123');

    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('still returns 200 for an invalid token (idempotent)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'garbage-token' });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/totp/setup
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/totp/setup', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/v1/auth/totp/setup').send({});
    expect(res.status).toBe(401);
  });

  it('returns secret and qrCodeUri when authenticated', async () => {
    const { db, speakeasy } = getMocks();
    const accessToken = jwtLib.signAccessToken({
      id: 'user-123',
      email: 'admin@aop.local',
      role: 'ADMIN',
    });
    db.prisma.user.findUnique.mockResolvedValue(baseUser);
    speakeasy.generateSecret.mockReturnValue({
      base32: 'MYSECRET',
      otpauth_url: 'otpauth://totp/AOP:admin@aop.local?secret=MYSECRET',
    });

    const res = await request(app)
      .post('/api/v1/auth/totp/setup')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('secret');
    expect(res.body.data).toHaveProperty('qrCodeUri');
  });
});
