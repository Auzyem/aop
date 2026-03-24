import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserRole, AuthenticatedUser } from '@aop/types';
import { UnauthorizedError, ForbiddenError } from '@aop/utils';
import { verifyAccessToken } from '../lib/jwt.js';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN' as const,
  ADMIN: 'ADMIN' as const,
  COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER' as const,
  TRADE_MANAGER: 'TRADE_MANAGER' as const,
  OPERATIONS: 'OPERATIONS' as const,
  VIEWER: 'VIEWER' as const,
};

export function authenticate(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Missing or malformed Authorization header'));
    }

    const token = authHeader.slice(7);
    try {
      const payload = verifyAccessToken(token);
      if (payload.type !== 'access') {
        return next(new UnauthorizedError('Invalid token type'));
      }
      const user: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        agentId: payload.agentId,
      };
      req.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireRole(...roles: UserRole[]): RequestHandler[] {
  return [
    authenticate(),
    (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required'));
      }
      if (!roles.includes(req.user.role)) {
        return next(new ForbiddenError('Insufficient permissions'));
      }
      return next();
    },
  ];
}
