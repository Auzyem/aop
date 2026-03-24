import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

// Queue names — add new queues here as features are built
export const QUEUE_NAMES = {
  COMPLIANCE_CHECK: 'compliance-check',
  FX_RATE_UPDATE: 'fx-rate-update',
  EXPORT_DECLARATION: 'export-declaration',
  EMAIL_NOTIFICATION: 'email-notification',
  AUDIT_LOG: 'audit-log',
  KYC_RENEWAL_REMINDER: 'kyc-renewal-reminder',
  OCR_PROCESSING: 'ocr-processing',
  LME_PRICE_POLL: 'lme-price-poll',
  REPORT_GENERATION: 'report-generation',
  AGENT_SCORING: 'agent-scoring',
  BACKUP_VERIFY: 'backup-verify',
  RETENTION_REVIEW: 'retention-review',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Creates and returns all BullMQ queues, sharing the given Redis connection.
 */
export function createQueues(connection: Redis): Record<QueueName, Queue> {
  const opts = { connection };

  return {
    [QUEUE_NAMES.COMPLIANCE_CHECK]: new Queue(QUEUE_NAMES.COMPLIANCE_CHECK, opts),
    [QUEUE_NAMES.FX_RATE_UPDATE]: new Queue(QUEUE_NAMES.FX_RATE_UPDATE, opts),
    [QUEUE_NAMES.EXPORT_DECLARATION]: new Queue(QUEUE_NAMES.EXPORT_DECLARATION, opts),
    [QUEUE_NAMES.EMAIL_NOTIFICATION]: new Queue(QUEUE_NAMES.EMAIL_NOTIFICATION, opts),
    [QUEUE_NAMES.AUDIT_LOG]: new Queue(QUEUE_NAMES.AUDIT_LOG, opts),
    [QUEUE_NAMES.KYC_RENEWAL_REMINDER]: new Queue(QUEUE_NAMES.KYC_RENEWAL_REMINDER, opts),
    [QUEUE_NAMES.OCR_PROCESSING]: new Queue(QUEUE_NAMES.OCR_PROCESSING, opts),
    [QUEUE_NAMES.LME_PRICE_POLL]: new Queue(QUEUE_NAMES.LME_PRICE_POLL, opts),
    [QUEUE_NAMES.REPORT_GENERATION]: new Queue(QUEUE_NAMES.REPORT_GENERATION, opts),
    [QUEUE_NAMES.AGENT_SCORING]: new Queue(QUEUE_NAMES.AGENT_SCORING, opts),
    [QUEUE_NAMES.BACKUP_VERIFY]: new Queue(QUEUE_NAMES.BACKUP_VERIFY, opts),
    [QUEUE_NAMES.RETENTION_REVIEW]: new Queue(QUEUE_NAMES.RETENTION_REVIEW, opts),
  };
}
