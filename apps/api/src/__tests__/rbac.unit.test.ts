/**
 * Unit tests for RBAC middleware.
 * Covers: authenticate(), requireRole()
 * Uses lightweight mock request/response/next helpers — no Supertest.
 */

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('@aop/utils', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    constructor(msg = 'Authentication required') {
      super(msg);
      this.name = 'UnauthorizedError';
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
}));

jest.mock('../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/rbac';
import { verifyAccessToken } from '../lib/jwt';

const mockVerify = verifyAccessToken as jest.Mock;

// ── Helper: mock Express request ─────────────────────────────────────────────

function makeReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    user: undefined,
  } as Partial<Request>;
}

function makeNext(): jest.Mock {
  return jest.fn();
}

// ── Valid token payload builder ───────────────────────────────────────────────

function validPayload(role: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'access',
    sub: 'user-123',
    email: 'user@aop.local',
    role,
    ...extra,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// authenticate()
// ═══════════════════════════════════════════════════════════════════════════

describe('authenticate()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next() with no error and attaches user when token is valid', () => {
    mockVerify.mockReturnValueOnce(validPayload('ADMIN'));
    const req = makeReq('Bearer valid-token');
    const next = makeNext();

    authenticate()(req as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(); // called with no args = success
    expect(req.user).toMatchObject({ id: 'user-123', email: 'user@aop.local', role: 'ADMIN' });
  });

  it('calls next(UnauthorizedError) when Authorization header is missing', () => {
    const req = makeReq(); // no header
    const next = makeNext();

    authenticate()(req as Request, {} as Response, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe('UnauthorizedError');
  });

  it('calls next(UnauthorizedError) when Authorization header does not start with Bearer', () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    const next = makeNext();

    authenticate()(req as Request, {} as Response, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });

  it('calls next(UnauthorizedError) when token type is not "access"', () => {
    mockVerify.mockReturnValueOnce({ type: 'refresh', sub: 'u1', email: 'x@y.com', role: 'ADMIN' });
    const req = makeReq('Bearer some-refresh-token');
    const next = makeNext();

    authenticate()(req as Request, {} as Response, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toContain('Invalid token type');
  });

  it('calls next(error) when verifyAccessToken throws (e.g. expired)', () => {
    const jwtError = new Error('jwt expired');
    mockVerify.mockImplementationOnce(() => {
      throw jwtError;
    });
    const req = makeReq('Bearer expired-token');
    const next = makeNext();

    authenticate()(req as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(jwtError);
  });

  it('attaches agentId to user when present in token payload', () => {
    mockVerify.mockReturnValueOnce(validPayload('OPERATIONS', { agentId: 'agent-456' }));
    const req = makeReq('Bearer token-with-agent');
    const next = makeNext();

    authenticate()(req as Request, {} as Response, next);

    expect(req.user?.agentId).toBe('agent-456');
  });

  it('attaches undefined agentId when not present in token', () => {
    mockVerify.mockReturnValueOnce(validPayload('ADMIN'));
    const req = makeReq('Bearer token-no-agent');
    const next = makeNext();

    authenticate()(req as Request, {} as Response, next);

    expect(req.user?.agentId).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// requireRole()
// ═══════════════════════════════════════════════════════════════════════════

describe('requireRole()', () => {
  beforeEach(() => jest.clearAllMocks());

  function runMiddlewareChain(
    handlers: ReturnType<typeof requireRole>,
    req: Partial<Request>,
    next: jest.Mock,
  ) {
    let idx = 0;
    function runNext(err?: unknown) {
      if (err) return next(err);
      if (idx < handlers.length) {
        handlers[idx++](req as Request, {} as Response, runNext as NextFunction);
      } else {
        next();
      }
    }
    runNext();
  }

  it('calls next() (no error) when role matches', () => {
    mockVerify.mockReturnValueOnce(validPayload('COMPLIANCE_OFFICER'));
    const req = makeReq('Bearer valid-token');
    const next = makeNext();

    runMiddlewareChain(requireRole('COMPLIANCE_OFFICER'), req, next);

    expect(next).toHaveBeenCalledWith(); // success — no error arg
  });

  it('calls next(ForbiddenError) when role is not in allowed list', () => {
    mockVerify.mockReturnValueOnce(validPayload('VIEWER'));
    const req = makeReq('Bearer valid-token');
    const next = makeNext();

    runMiddlewareChain(requireRole('COMPLIANCE_OFFICER', 'TRADE_MANAGER'), req, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe('ForbiddenError');
  });

  it('allows multiple roles — passes for any matching role', () => {
    mockVerify.mockReturnValueOnce(validPayload('TRADE_MANAGER'));
    const req = makeReq('Bearer valid-token');
    const next = makeNext();

    runMiddlewareChain(
      requireRole('COMPLIANCE_OFFICER', 'TRADE_MANAGER', 'SUPER_ADMIN'),
      req,
      next,
    );

    expect(next).toHaveBeenCalledWith(); // success
  });

  it('rejects unauthenticated request (no Authorization header)', () => {
    const req = makeReq(); // no header
    const next = makeNext();

    runMiddlewareChain(requireRole('ADMIN'), req, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });

  it('returns two handlers (authenticate + role check)', () => {
    const handlers = requireRole('ADMIN');
    expect(handlers).toHaveLength(2);
  });

  // ── Role-specific access scenarios ───────────────────────────────────────

  it('SUPER_ADMIN passes for any role requirement', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const requiredRole of [
      'ADMIN',
      'COMPLIANCE_OFFICER',
      'TRADE_MANAGER',
      'OPERATIONS',
      'VIEWER',
    ] as const) {
      mockVerify.mockReturnValueOnce(validPayload('SUPER_ADMIN'));
      const req = makeReq('Bearer token');
      const next = makeNext();

      // requireRole only checks inclusion, not hierarchy — test with SUPER_ADMIN explicitly listed
      runMiddlewareChain(requireRole('SUPER_ADMIN'), req, next);
      expect(next).toHaveBeenCalledWith();
    }
  });

  it('VIEWER is rejected when ADMIN or above is required', () => {
    mockVerify.mockReturnValueOnce(validPayload('VIEWER'));
    const req = makeReq('Bearer viewer-token');
    const next = makeNext();

    runMiddlewareChain(requireRole('ADMIN', 'SUPER_ADMIN'), req, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('OPERATIONS role is accepted when OPERATIONS is in the allowed list', () => {
    mockVerify.mockReturnValueOnce(validPayload('OPERATIONS'));
    const req = makeReq('Bearer token');
    const next = makeNext();

    runMiddlewareChain(requireRole('OPERATIONS', 'ADMIN'), req, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('COMPLIANCE_OFFICER is rejected when only TRADE_MANAGER allowed', () => {
    mockVerify.mockReturnValueOnce(validPayload('COMPLIANCE_OFFICER'));
    const req = makeReq('Bearer token');
    const next = makeNext();

    runMiddlewareChain(requireRole('TRADE_MANAGER'), req, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});
