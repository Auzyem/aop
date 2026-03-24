import { createHmac } from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '@aop/db';
import { logger } from '@aop/utils';

// ---------------------------------------------------------------------------
// HMAC-SHA256 audit signature
// Key source: AUDIT_HMAC_SECRET env variable
// Canonical message: "{entityType}:{entityId}:{action}:{userId}:{timestamp}"
// ---------------------------------------------------------------------------

function getHmacSecret(): string {
  const secret = process.env.AUDIT_HMAC_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUDIT_HMAC_SECRET must be set in production');
    }
    return 'dev-audit-hmac-secret-change-in-production';
  }
  return secret;
}

/**
 * Compute HMAC-SHA256 over canonical audit record fields.
 * Exported so audit.service can re-compute for tamper detection.
 */
export function computeAuditHmac(
  entityType: string,
  entityId: string,
  action: string,
  userId: string,
  timestamp: string,
): string {
  const message = `${entityType}:${entityId}:${action}:${userId}:${timestamp}`;
  return createHmac('sha256', getHmacSecret()).update(message, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Middleware helpers
// ---------------------------------------------------------------------------

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function deriveAction(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return method.toUpperCase();
  }
}

function deriveEntityType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const apiIdx = segments.findIndex((s) => s === 'v1');
  return segments[apiIdx + 1] ?? segments[0] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// auditMutations — intercepts all mutating responses and writes signed records
// ---------------------------------------------------------------------------

export function auditMutations(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
      return next();
    }

    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      const userId = req.user?.id;
      const entityType = deriveEntityType(req.path);
      const entityId = req.params.id ?? '';
      const action = deriveAction(req.method);
      const ipAddress = req.ip ?? null;
      const userAgent = (req.headers['user-agent'] as string) ?? null;
      const timestamp = new Date().toISOString();

      if (userId) {
        const hmacSig = computeAuditHmac(entityType, entityId, action, userId, timestamp);

        prisma.auditEvent
          .create({
            data: {
              userId,
              entityType,
              entityId,
              action,
              ipAddress,
              userAgent,
              hmacSig,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              newValue: body != null ? (body as any) : undefined,
            },
          })
          .catch((err: unknown) => logger.error({ err }, 'Failed to write audit event'));
      }

      return originalJson(body);
    };

    return next();
  };
}
