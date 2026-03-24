import type { Request, Response, NextFunction } from 'express';
import { isAppError } from '@aop/utils';
import { logger } from '@aop/utils';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (isAppError(err)) {
    if (err.statusCode >= 500) {
      logger.error({ err }, 'Operational error');
    } else {
      logger.warn({ err }, 'Client error');
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Unhandled / programmer error
  logger.error({ err }, 'Unexpected error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
    timestamp: new Date().toISOString(),
  });
}
