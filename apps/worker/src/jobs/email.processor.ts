import type { Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { prisma } from '@aop/db';
import { logger } from '@aop/utils';

// ---------------------------------------------------------------------------
// Job data shapes — extend the union as new email types are added
// ---------------------------------------------------------------------------

export type EmailJobData = {
  type: 'lme-price-alert';
  alertId: string;
  transactionId: string;
  clientName: string;
  referencePriceUsd: number;
  newPriceUsd: number;
  changePct: string;
  direction: 'UP' | 'DOWN';
  exposureUsd: string;
  alertedAt: string;
};

// ---------------------------------------------------------------------------
// Shared SMTP transporter (created once per job, keeps env hot-reload safe)
// ---------------------------------------------------------------------------

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// LME price alert email
// ---------------------------------------------------------------------------

async function sendLmePriceAlertEmail(
  data: EmailJobData & { type: 'lme-price-alert' },
): Promise<void> {
  const recipients = await prisma.user.findMany({
    where: {
      role: { in: ['TRADE_MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      isActive: true,
    },
    select: { email: true },
  });

  if (!recipients.length) {
    logger.warn(
      { transactionId: data.transactionId },
      'LME alert email: no active TRADE_MANAGER/ADMIN recipients',
    );
    return;
  }

  const sign = data.direction === 'UP' ? '+' : '-';
  const subject = `[AOP] LME Price Alert — ${data.direction} ${sign}${data.changePct}% — ${data.transactionId}`;
  const html = `
    <h2 style="color:#b45309">LME Gold Price Alert</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Transaction</td><td><strong>${data.transactionId}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Client</td><td>${data.clientName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Reference Price</td><td>USD ${data.referencePriceUsd.toFixed(2)} / troy oz</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">New Price</td><td>USD ${data.newPriceUsd.toFixed(2)} / troy oz</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Change</td><td style="color:${data.direction === 'UP' ? '#059669' : '#dc2626'}">${sign}${data.changePct}%</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Current Exposure</td><td>USD ${data.exposureUsd}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Alerted At (UTC)</td><td>${data.alertedAt}</td></tr>
    </table>
    <p style="margin-top:16px;font-size:12px;color:#9ca3af">
      This is an automated alert from the Aurum Operations Platform.
    </p>
  `;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'noreply@aop.local',
    to: recipients.map((r) => r.email).join(', '),
    subject,
    html,
  });

  logger.info(
    { transactionId: data.transactionId, recipientCount: recipients.length },
    'LME price alert email sent',
  );

  // Mark alert record as email-sent (non-critical)
  if (data.alertId) {
    await prisma.priceAlert
      .update({ where: { id: data.alertId }, data: { emailSent: true } })
      .catch((err) =>
        logger.warn({ err, alertId: data.alertId }, 'Failed to mark alert email-sent'),
      );
  }
}

// ---------------------------------------------------------------------------
// Main processor — dispatches by job data type
// ---------------------------------------------------------------------------

export async function emailProcessor(job: Job<EmailJobData>): Promise<void> {
  const { data } = job;

  try {
    if (data.type === 'lme-price-alert') {
      await sendLmePriceAlertEmail(data);
    } else {
      logger.warn(
        { jobId: job.id, type: (data as { type: string }).type },
        'Unknown email job type — skipping',
      );
    }
  } catch (err) {
    logger.error({ err, jobId: job.id, type: data.type }, 'Email processor failed');
    throw err; // rethrow so BullMQ marks job as failed and retries
  }
}
