import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../lib/response.js';
import {
  loginWithCredentials,
  verifyTotp,
  setupTotp,
  refreshTokens,
  logout,
} from './auth.service.js';
import type { AuthenticatedUser } from '@aop/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await loginWithCredentials(req.body.email, req.body.password);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function totpVerifyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await verifyTotp(req.body.tempToken, req.body.code);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function totpSetupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
      return;
    }
    const result = await setupTotp(req.user.id);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await refreshTokens(req.body.refreshToken);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await logout(req.body.refreshToken);
    sendSuccess(res, { message: 'Logged out successfully' }, 200);
  } catch (err) {
    next(err);
  }
}
