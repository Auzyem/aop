/**
 * Endpoint-specific rate limiters.
 *
 * All limiters return 429 with a Retry-After header.
 * In production, RedisStore is used so limits are shared across instances.
 */

import rateLimit, { type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from './redis.js';
import { logger } from '@aop/utils';
import type { Request, Response } from 'express';

function buildStore(prefix: string) {
  // Skip Redis store in test environment — use in-memory fallback
  if (process.env.NODE_ENV === 'test') return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new RedisStore({
      // rate-limit-redis v4 API — cast to any to avoid ioredis vs redis reply type mismatch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendCommand: ((...args: string[]) => redis.call(args[0], ...args.slice(1))) as any,
      prefix: `rl:${prefix}:`,
    });
  } catch (err) {
    logger.warn(
      { err, prefix },
      'RedisStore unavailable — falling back to in-memory rate limit store',
    );
    return undefined;
  }
}

const handler429: Options['handler'] = (_req: Request, res: Response) => {
  const windowMs = 900_000; // default fallback 15 min — overridden per limiter instance
  const retryAfterSec = Math.ceil(windowMs / 1000);
  res
    .status(429)
    .setHeader('Retry-After', String(retryAfterSec))
    .json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests — please slow down',
        retryAfter: retryAfterSec,
      },
    });
};

function make429Handler(windowMs: number): Options['handler'] {
  const retryAfterSec = Math.ceil(windowMs / 1000);
  return (_req: Request, res: Response) => {
    res
      .status(429)
      .setHeader('Retry-After', String(retryAfterSec))
      .json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests — please slow down',
          retryAfter: retryAfterSec,
        },
      });
  };
}

// ---------------------------------------------------------------------------
// /auth/login — 5 requests per 15 minutes per IP
// ---------------------------------------------------------------------------

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  store: buildStore('login'),
  handler: make429Handler(15 * 60 * 1000),
  skipSuccessfulRequests: false,
});

// ---------------------------------------------------------------------------
// /auth/totp/verify — 5 requests per 15 minutes per IP
// ---------------------------------------------------------------------------

export const totpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  store: buildStore('totp'),
  handler: make429Handler(15 * 60 * 1000),
});

// ---------------------------------------------------------------------------
// Document upload — 20 requests per minute per authenticated user
// ---------------------------------------------------------------------------

export const documentUploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req as Request & { user?: { id: string } }).user?.id ?? req.ip ?? 'unknown',
  store: buildStore('docupload'),
  handler: make429Handler(60 * 1000),
});

// ---------------------------------------------------------------------------
// Sanctions screening — 10 requests per hour per user (API cost protection)
// ---------------------------------------------------------------------------

export const sanctionsRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req as Request & { user?: { id: string } }).user?.id ?? req.ip ?? 'unknown',
  store: buildStore('sanctions'),
  handler: make429Handler(60 * 60 * 1000),
});

// ---------------------------------------------------------------------------
// General API — 300 requests per minute per authenticated user
// ---------------------------------------------------------------------------

export const generalApiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req as Request & { user?: { id: string } }).user?.id ?? req.ip ?? 'unknown',
  store: buildStore('general'),
  handler: make429Handler(60 * 1000),
  skip: (req) => req.path === '/health' || req.path === '/healthz',
});

// Suppress unused warning — handler429 is kept as a reference signature
void handler429;
