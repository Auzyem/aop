import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import { computeAuditHmac } from '../../middleware/audit.js';
import type { AuditLogQuery } from './admin.schemas.js';

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

function buildWhere(query: Omit<AuditLogQuery, 'page' | 'limit'>): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (query.userId) where.userId = query.userId;
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.action) where.action = query.action;

  if (query.dateFrom || query.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) createdAt.lte = new Date(query.dateTo);
    where.createdAt = createdAt;
  }

  return where;
}

export async function queryAuditLog(query: AuditLogQuery, _actor: AuthenticatedUser) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;
  const where = buildWhere(query);

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, role: true } },
      },
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return { events, total, page, limit };
}

export async function exportAuditCsv(
  query: Omit<AuditLogQuery, 'page' | 'limit'>,
  _actor: AuthenticatedUser,
): Promise<string> {
  const where = buildWhere(query);

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, email: true, role: true } },
    },
  });

  const header = 'timestamp,userId,email,role,ipAddress,action,entityType,entityId,changes,hmacSig';
  const rows = events.map((e) => {
    const changes = JSON.stringify({ old: e.oldValue, new: e.newValue });
    const escapeCsv = (val: string | null | undefined) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    return [
      escapeCsv(e.createdAt.toISOString()),
      escapeCsv(e.userId ?? ''),
      escapeCsv(e.user?.email ?? ''),
      escapeCsv(e.user?.role ?? ''),
      escapeCsv(e.ipAddress ?? ''),
      escapeCsv(e.action),
      escapeCsv(e.entityType),
      escapeCsv(e.entityId),
      escapeCsv(changes),
      escapeCsv(e.hmacSig ?? ''),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Audit integrity verification — re-compute HMAC for all records
// ---------------------------------------------------------------------------

export interface AuditVerifyResult {
  total: number;
  valid: number;
  tampered: number;
  noSignature: number;
  tamperedIds: string[];
}

export async function verifyAuditIntegrity(_actor: AuthenticatedUser): Promise<AuditVerifyResult> {
  logger.info({ actor: _actor.id }, 'Starting audit log integrity verification');

  // Process in batches to avoid loading millions of records at once
  const BATCH_SIZE = 500;
  let cursor: string | undefined;
  let total = 0;
  let valid = 0;
  let tampered = 0;
  let noSignature = 0;
  const tamperedIds: string[] = [];

  do {
    const events = await prisma.auditEvent.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        userId: true,
        createdAt: true,
        hmacSig: true,
      },
    });

    for (const event of events) {
      total++;

      if (!event.hmacSig) {
        // Records created before HMAC signing was introduced
        noSignature++;
        continue;
      }

      const expected = computeAuditHmac(
        event.entityType,
        event.entityId,
        event.action,
        event.userId,
        event.createdAt.toISOString(),
      );

      if (expected === event.hmacSig) {
        valid++;
      } else {
        tampered++;
        tamperedIds.push(event.id);
        logger.warn({ eventId: event.id }, 'AUDIT INTEGRITY FAILURE — HMAC mismatch detected');
      }
    }

    cursor = events.length === BATCH_SIZE ? events[events.length - 1]?.id : undefined;
  } while (cursor);

  logger.info({ total, valid, tampered, noSignature }, 'Audit integrity verification complete');

  return { total, valid, tampered, noSignature, tamperedIds };
}
