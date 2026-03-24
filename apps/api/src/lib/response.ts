import type { Response } from 'express';

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: SuccessResponse<T>['meta'],
): void {
  const body: SuccessResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
  details?: unknown,
): void {
  const body: ErrorResponse = {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  };
  if (details !== undefined) body.error.details = details;
  res.status(statusCode).json(body);
}
