import request from 'supertest';
import express, { type Request, type Response } from 'express';
import { authenticate, requireRole } from '../middleware/rbac';
import { errorHandler } from '../middleware/errorHandler';
import * as jwtLib from '../lib/jwt';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

jest.mock('@aop/utils', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  UnauthorizedError: class UnauthorizedError extends Error {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    constructor(msg: string) {
      super(msg);
      this.name = 'UnauthorizedError';
    }
  },
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
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(middleware: ReturnType<typeof requireRole> | ReturnType<typeof authenticate>[]) {
  const testApp = express();
  testApp.use(express.json());

  const handlers = Array.isArray(middleware) ? middleware : [middleware];
  testApp.get('/test', ...handlers, (req: Request, res: Response) => {
    res.json({ user: req.user });
  });

  testApp.use(errorHandler);
  return testApp;
}

// ---------------------------------------------------------------------------
// authenticate() middleware
// ---------------------------------------------------------------------------

describe('authenticate()', () => {
  it('populates req.user for a valid access token', async () => {
    const token = jwtLib.signAccessToken({
      id: 'u1',
      email: 'test@aop.local',
      role: 'ADMIN',
    });

    const testApp = makeApp([authenticate()]);
    const res = await request(testApp).get('/test').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('u1');
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('returns 401 for missing Authorization header', async () => {
    const testApp = makeApp([authenticate()]);
    const res = await request(testApp).get('/test');
    expect(res.status).toBe(401);
  });

  it('returns 401 for malformed Authorization header', async () => {
    const testApp = makeApp([authenticate()]);
    const res = await request(testApp).get('/test').set('Authorization', 'Token abc123');
    expect(res.status).toBe(401);
  });

  it('returns 401 for expired/invalid token', async () => {
    const testApp = makeApp([authenticate()]);
    const res = await request(testApp)
      .get('/test')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token type is not access', async () => {
    const { token } = jwtLib.signRefreshToken('u1');
    const testApp = makeApp([authenticate()]);
    const res = await request(testApp).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// requireRole() middleware
// ---------------------------------------------------------------------------

describe('requireRole()', () => {
  it('allows user with the required role', async () => {
    const token = jwtLib.signAccessToken({ id: 'u2', email: 'ops@aop.local', role: 'OPERATIONS' });
    const testApp = makeApp(requireRole('OPERATIONS', 'ADMIN'));

    const res = await request(testApp).get('/test').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('OPERATIONS');
  });

  it('returns 403 when user lacks the required role', async () => {
    const token = jwtLib.signAccessToken({ id: 'u3', email: 'viewer@aop.local', role: 'VIEWER' });
    const testApp = makeApp(requireRole('ADMIN', 'SUPER_ADMIN'));

    const res = await request(testApp).get('/test').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const testApp = makeApp(requireRole('ADMIN'));
    const res = await request(testApp).get('/test');
    expect(res.status).toBe(401);
  });

  it('passes agentId through to req.user for OPERATIONS token', async () => {
    const token = jwtLib.signAccessToken({
      id: 'u4',
      email: 'agent@aop.local',
      role: 'OPERATIONS',
      agentId: 'agent-abc',
    });
    const testApp = makeApp(requireRole('OPERATIONS'));

    const res = await request(testApp).get('/test').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.agentId).toBe('agent-abc');
  });
});
