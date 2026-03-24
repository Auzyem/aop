import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { sendMail } from '../../lib/mailer.js';
import { getSignedDownloadUrl, getObjectSizeBytes, getObjectBytes } from '../../lib/s3.js';

const REPORT_SCHEDULE_KEY = 'REPORT_SCHEDULE';
const MAX_ATTEMPTS = 3;
const TEN_MB = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

async function getRecipientsForType(reportType: string): Promise<string[]> {
  const setting = await prisma.systemSettings.findUnique({
    where: { key: REPORT_SCHEDULE_KEY },
  });
  if (!setting || !Array.isArray(setting.value)) return [];

  const schedule = setting.value as Array<{
    reportType: string;
    recipients: string[];
    enabled: boolean;
  }>;
  const entry = schedule.find((s) => s.reportType === reportType && s.enabled);
  return entry?.recipients ?? [];
}

// ---------------------------------------------------------------------------
// Email build helpers
// ---------------------------------------------------------------------------

function buildSubject(reportType: string, reportId: string): string {
  const labels: Record<string, string> = {
    MONTHLY_TRANSACTION: 'Monthly Transaction Activity Report',
    OECD_DUE_DILIGENCE: 'OECD Due Diligence Report',
    CLIENT_KYC_STATUS: 'Client KYC Status Report',
    STR_DRAFT: 'Suspicious Transaction Report (DRAFT)',
    PORTFOLIO_SUMMARY: 'Weekly Portfolio Summary',
    POST_TRANSACTION_AUDIT: 'Post-Transaction Audit Report',
  };
  const label = labels[reportType] ?? reportType;
  return `[AOP] ${label} — ${reportId}`;
}

// ---------------------------------------------------------------------------
// Single delivery attempt (no retry)
// ---------------------------------------------------------------------------

async function attemptDelivery(
  recipient: string,
  subject: string,
  storageKey: string,
): Promise<void> {
  const sizeBytes = await getObjectSizeBytes(storageKey);

  if (sizeBytes > 0 && sizeBytes <= TEN_MB) {
    // Attach file directly
    const fileBuffer = await getObjectBytes(storageKey);
    const filename = storageKey.split('/').pop() ?? 'report.pdf';
    const isDocx = filename.endsWith('.docx');
    const mimeType = isDocx
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf';

    await sendMail({
      to: recipient,
      subject,
      text: 'Please find the generated report attached.',
      html: `<p>Please find the generated report attached.</p>`,
      attachments: [{ filename, content: fileBuffer, contentType: mimeType }],
    });
  } else {
    // File too large or size unknown — send signed link
    const signedUrl = await getSignedDownloadUrl(storageKey, 7 * 24 * 3600); // 7-day link
    await sendMail({
      to: recipient,
      subject,
      text: `Your report is ready. Download it here (valid 7 days): ${signedUrl}`,
      html: `<p>Your report is ready.</p><p><a href="${signedUrl}">Download Report</a> (link valid for 7 days)</p>`,
    });
  }
}

// ---------------------------------------------------------------------------
// Alert ADMIN recipients on delivery failure
// ---------------------------------------------------------------------------

async function alertAdmins(
  reportId: string,
  reportType: string,
  failedRecipient: string,
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
    select: { email: true },
  });
  if (!admins.length) return;

  const subject = `[AOP] Report Delivery Failed — ${reportId}`;
  const text =
    `Automated report delivery failed after ${MAX_ATTEMPTS} attempts.\n\n` +
    `Report ID: ${reportId}\nReport Type: ${reportType}\nFailed Recipient: ${failedRecipient}`;

  await sendMail({
    to: admins.map((a) => a.email),
    subject,
    text,
  }).catch(() => {}); // best-effort
}

// ---------------------------------------------------------------------------
// Core delivery with retry + exponential backoff
// ---------------------------------------------------------------------------

async function deliverToRecipient(
  reportId: string,
  reportType: string,
  storageKey: string,
  recipient: string,
): Promise<void> {
  // Create log record
  const log = await prisma.reportDeliveryLog.create({
    data: { reportId, recipient, deliveryStatus: 'PENDING', attempts: 0 },
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 2)));
      }

      const subject = buildSubject(reportType, reportId);
      await attemptDelivery(recipient, subject, storageKey);

      // Success
      await prisma.reportDeliveryLog.update({
        where: { id: log.id },
        data: { deliveryStatus: 'SENT', sentAt: new Date(), attempts: attempt },
      });
      logger.info({ reportId, recipient, attempt }, 'Report delivered successfully');
      return;
    } catch (err) {
      lastError = err;
      logger.warn(
        { err, reportId, recipient, attempt },
        `Report delivery attempt ${attempt} failed`,
      );
    }
  }

  // All attempts exhausted
  await prisma.reportDeliveryLog.update({
    where: { id: log.id },
    data: {
      deliveryStatus: 'FAILED',
      attempts: MAX_ATTEMPTS,
      failureReason: lastError instanceof Error ? lastError.message : String(lastError),
    },
  });
  logger.error({ reportId, recipient }, 'Report delivery failed after all retry attempts');

  await alertAdmins(reportId, reportType, recipient);
}

// ---------------------------------------------------------------------------
// Public entry point — called after report generation completes
// ---------------------------------------------------------------------------

export async function deliverReport(
  reportId: string,
  reportType: string,
  storageKey: string,
): Promise<void> {
  const recipients = await getRecipientsForType(reportType);

  if (!recipients.length) {
    logger.debug(
      { reportId, reportType },
      'No recipients configured for report delivery — skipping',
    );
    return;
  }

  // Deliver to all recipients concurrently
  await Promise.allSettled(
    recipients.map((recipient) => deliverToRecipient(reportId, reportType, storageKey, recipient)),
  );
}
