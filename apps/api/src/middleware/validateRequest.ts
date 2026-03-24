import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema, ZodError } from 'zod';
import { sendError } from '../lib/response.js';

function formatZodErrors(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!result[path]) result[path] = [];
    result[path].push(issue.message);
  }
  return result;
}

export function validateRequest<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      sendError(res, 'VALIDATION_ERROR', 'Validation failed', 400, formatZodErrors(result.error));
      return;
    }
    req.body = result.data;
    next();
  };
}
