import { prisma } from '@aop/db';
import { NotFoundError, ValidationError } from '@aop/utils';
import { logger } from '@aop/utils';
import { getSignedDownloadUrl } from '../../lib/s3.js';
import type { RegulatoryReport, Prisma } from '@aop/db';
import type { AuthenticatedUser } from '@aop/types';
import type { GenerateReportInput, UpdateScheduleInput } from './reporting.schemas.js';
import { generatePostTransactionAudit } from './generators/post-transaction-audit.js';
import { generateOecdDueDiligence } from './generators/oecd-due-diligence.js';
import { generateTransactionActivity } from './generators/transaction-activity.js';
import { generateClientKycStatus } from './generators/client-kyc-status.js';
import { generateStrDraft as generateStrDraftFile } from './generators/str-draft.js';
import { generatePortfolioSummary } from './generators/portfolio-summary.js';
import { deliverReport } from './report-delivery.service.js';

const REPORT_SCHEDULE_KEY = 'REPORT_SCHEDULE';

export interface ReportScheduleItem {
  reportType: string;
  cronExpression: string;
  recipients: string[];
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// List reports
// ---------------------------------------------------------------------------

export async function listReports(_actor: AuthenticatedUser): Promise<RegulatoryReport[]> {
  return prisma.regulatoryReport.findMany({
    orderBy: { generatedAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Generate report — creates record immediately, runs generation asynchronously
// ---------------------------------------------------------------------------

export async function generateReport(
  dto: GenerateReportInput,
  actor: AuthenticatedUser,
): Promise<RegulatoryReport> {
  const now = new Date();
  const periodStart = dto.periodStart
    ? new Date(dto.periodStart)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = dto.periodEnd
    ? new Date(dto.periodEnd)
    : new Date(now.getFullYear(), now.getMonth(), 0);

  const report = await prisma.regulatoryReport.create({
    data: {
      reportType: dto.reportType as never,
      status: 'GENERATING',
      periodStart,
      periodEnd,
      generatedBy: actor.id,
      notes: dto.notes,
    },
  });

  // Run generation asynchronously
  setImmediate(() => {
    void runGeneration(report.id, dto, periodStart, periodEnd).catch((err: unknown) => {
      logger.error({ err, reportId: report.id }, 'Report generation failed in setImmediate');
    });
  });

  return report;
}

async function runGeneration(
  reportId: string,
  dto: GenerateReportInput,
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {
  try {
    let result: { storageKey: string; url: string };

    switch (dto.reportType) {
      case 'POST_TRANSACTION_AUDIT': {
        if (!dto.transactionId) {
          throw new ValidationError('transactionId is required for POST_TRANSACTION_AUDIT');
        }
        result = await generatePostTransactionAudit(dto.transactionId);
        break;
      }
      case 'OECD_DUE_DILIGENCE': {
        result = await generateOecdDueDiligence(periodStart, periodEnd);
        break;
      }
      case 'MONTHLY_TRANSACTION': {
        result = await generateTransactionActivity(periodStart, periodEnd);
        break;
      }
      case 'CLIENT_KYC_STATUS': {
        result = await generateClientKycStatus();
        break;
      }
      case 'STR_DRAFT': {
        if (!dto.transactionId) {
          throw new ValidationError('transactionId is required for STR_DRAFT');
        }
        result = await generateStrDraftFile(dto.transactionId);
        break;
      }
      case 'PORTFOLIO_SUMMARY': {
        result = await generatePortfolioSummary(periodStart, periodEnd);
        break;
      }
      default: {
        throw new ValidationError(`Unsupported report type: ${dto.reportType}`);
      }
    }

    await prisma.regulatoryReport.update({
      where: { id: reportId },
      data: {
        status: 'READY',
        storageKey: result.storageKey,
        filePath: result.url,
      },
    });

    logger.info({ reportId, reportType: dto.reportType }, 'Report generation completed');

    // Fire-and-forget delivery — errors are logged and retried internally
    void deliverReport(reportId, dto.reportType, result.storageKey).catch((err: unknown) => {
      logger.error({ err, reportId }, 'Report delivery failed unexpectedly');
    });
  } catch (err: unknown) {
    logger.error({ err, reportId }, 'Report generation failed');
    await prisma.regulatoryReport.update({
      where: { id: reportId },
      data: { status: 'FAILED' },
    });
  }
}

// ---------------------------------------------------------------------------
// Get single report
// ---------------------------------------------------------------------------

export async function getReport(id: string, _actor: AuthenticatedUser): Promise<RegulatoryReport> {
  const report = await prisma.regulatoryReport.findUnique({ where: { id } });
  if (!report) throw new NotFoundError('RegulatoryReport', id);
  return report;
}

// ---------------------------------------------------------------------------
// Get signed download URL
// ---------------------------------------------------------------------------

export async function getDownloadUrl(id: string, actor: AuthenticatedUser): Promise<string> {
  const report = await getReport(id, actor);
  if (!report.storageKey) {
    throw new ValidationError('Report is not ready for download yet');
  }
  return getSignedDownloadUrl(report.storageKey);
}

// ---------------------------------------------------------------------------
// Submit report
// ---------------------------------------------------------------------------

export async function submitReport(
  id: string,
  actor: AuthenticatedUser,
): Promise<RegulatoryReport> {
  const report = await getReport(id, actor);

  if (report.status !== 'READY') {
    throw new ValidationError(
      `Report cannot be submitted — current status is ${report.status}. Must be READY.`,
    );
  }

  return prisma.regulatoryReport.update({
    where: { id },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      submittedBy: actor.id,
    },
  });
}

// ---------------------------------------------------------------------------
// Suspicious transactions
// ---------------------------------------------------------------------------

const SUSPICIOUS_INCLUDE = {
  client: {
    select: {
      id: true,
      fullName: true,
      sanctionsStatus: true,
      isPEP: true,
      isEDD: true,
      riskRating: true,
    },
  },
  agent: { select: { id: true, companyName: true } },
} satisfies Prisma.TransactionInclude;

export type SuspiciousTransaction = Prisma.TransactionGetPayload<{
  include: typeof SUSPICIOUS_INCLUDE;
}>;

export async function getSuspiciousTransactions(
  _actor: AuthenticatedUser,
): Promise<SuspiciousTransaction[]> {
  return prisma.transaction.findMany({
    where: {
      OR: [
        { client: { sanctionsStatus: 'HIT' } },
        { assayDiscrepancyFlag: true },
        { client: { isPEP: true } },
      ],
    },
    include: SUSPICIOUS_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Generate STR draft
// ---------------------------------------------------------------------------

export async function generateStrDraft(
  txnId: string,
  actor: AuthenticatedUser,
): Promise<RegulatoryReport> {
  const now = new Date();
  const report = await prisma.regulatoryReport.create({
    data: {
      reportType: 'STR_DRAFT',
      status: 'GENERATING',
      periodStart: now,
      periodEnd: now,
      generatedBy: actor.id,
      notes: `STR draft for transaction ${txnId}`,
    },
  });

  setImmediate(() => {
    void generateStrDraftFile(txnId)
      .then((result) =>
        prisma.regulatoryReport.update({
          where: { id: report.id },
          data: { status: 'READY', storageKey: result.storageKey, filePath: result.url },
        }),
      )
      .catch(async (err: unknown) => {
        logger.error({ err, reportId: report.id }, 'STR draft generation failed');
        await prisma.regulatoryReport.update({
          where: { id: report.id },
          data: { status: 'FAILED' },
        });
      });
  });

  return report;
}

// ---------------------------------------------------------------------------
// Report schedule (stored in SystemSettings)
// ---------------------------------------------------------------------------

export async function getReportSchedule(): Promise<ReportScheduleItem[]> {
  const setting = await prisma.systemSettings.findUnique({
    where: { key: REPORT_SCHEDULE_KEY },
  });

  if (!setting) return [];

  const value = setting.value;
  if (Array.isArray(value)) {
    return value as unknown as ReportScheduleItem[];
  }
  return [];
}

export async function updateReportSchedule(
  dto: UpdateScheduleInput,
  actor: AuthenticatedUser,
): Promise<ReportScheduleItem[]> {
  const existing = await getReportSchedule();

  const idx = existing.findIndex((item) => item.reportType === dto.reportType);
  const newItem: ReportScheduleItem = {
    reportType: dto.reportType,
    cronExpression: dto.cronExpression,
    recipients: dto.recipients,
    enabled: dto.enabled ?? true,
  };

  let updated: ReportScheduleItem[];
  if (idx >= 0) {
    updated = [...existing];
    updated[idx] = newItem;
  } else {
    updated = [...existing, newItem];
  }

  await prisma.systemSettings.upsert({
    where: { key: REPORT_SCHEDULE_KEY },
    update: { value: updated as never, updatedBy: actor.id },
    create: { key: REPORT_SCHEDULE_KEY, value: updated as never, updatedBy: actor.id },
  });

  logger.info({ reportType: dto.reportType, actor: actor.id }, 'Report schedule updated');
  return updated;
}
