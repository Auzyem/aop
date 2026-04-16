/**
 * Annual document retention review job.
 *
 * Runs annually on Jan 1 at 07:00 UTC.
 *
 * Per AML/FATF regulations, all transaction documents must be retained for a
 * minimum of 10 years. This job NEVER deletes documents — it only identifies
 * documents whose retainUntil date has passed, generates a report, and emails
 * COMPLIANCE and ADMIN users for manual review and decision.
 */

import type { Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { prisma } from '@aop/db';
import { logger } from '@aop/utils';

export const RETENTION_REVIEW_CRON = '0 7 1 1 *'; // Jan 1 at 07:00 UTC

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
// Main processor
// ---------------------------------------------------------------------------

export async function retentionReviewProcessor(_job: Job): Promise<void> {
  const now = new Date();
  logger.info({ date: now.toISOString() }, 'Starting annual retention review');

  // Documents eligible for deletion review: retainUntil has passed AND not soft-deleted
  const eligible = await prisma.document.findMany({
    where: {
      retainUntil: { lt: now },
      isDeleted: false,
    },
    select: {
      id: true,
      documentType: true,
      filename: true,
      retainUntil: true,
      uploadedAt: true,
      transaction: { select: { id: true } },
      client: { select: { id: true, fullName: true } },
    },
    orderBy: { retainUntil: 'asc' },
  });

  logger.info({ count: eligible.length }, 'Documents eligible for retention review');

  const recipients = await prisma.user.findMany({
    where: {
      role: { in: ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER'] },
      isActive: true,
    },
    select: { email: true },
  });

  if (!recipients.length) {
    logger.warn('Retention review: no COMPLIANCE/ADMIN recipients found');
    return;
  }

  const year = now.getFullYear();
  const subject = `[AOP] Annual Document Retention Review — ${year} — ${eligible.length} document(s) eligible`;

  let tableRows = '';
  if (eligible.length === 0) {
    tableRows =
      '<tr><td colspan="5" style="padding:8px;text-align:center;color:#6b7280">No documents eligible for deletion this year.</td></tr>';
  } else {
    tableRows = eligible
      .map(
        (doc) => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:6px 12px">${doc.id.slice(0, 8)}…</td>
        <td style="padding:6px 12px">${doc.documentType}</td>
        <td style="padding:6px 12px">${doc.client?.fullName ?? '—'}</td>
        <td style="padding:6px 12px">${doc.transaction?.id ?? '—'}</td>
        <td style="padding:6px 12px">${doc.retainUntil?.toISOString().slice(0, 10) ?? '—'}</td>
      </tr>`,
      )
      .join('');
  }

  const html = `
    <h2 style="color:#b45309">Annual Document Retention Review — ${year}</h2>
    <p style="font-family:sans-serif;font-size:14px">
      The following <strong>${eligible.length}</strong> document(s) have passed their retention date
      and are eligible for deletion review. <strong>No documents have been deleted.</strong>
      All decisions require manual review and authorisation by a Compliance Officer.
    </p>
    <p style="font-family:sans-serif;font-size:14px;color:#dc2626;font-weight:600">
      Note: AML/FATF regulations require a 10-year minimum retention period for all
      transaction-related documents. Verify statutory obligations before approving any deletion.
    </p>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px">
      <thead style="background:#f3f4f6">
        <tr>
          <th style="padding:8px 12px;text-align:left">Doc ID</th>
          <th style="padding:8px 12px;text-align:left">Type</th>
          <th style="padding:8px 12px;text-align:left">Client</th>
          <th style="padding:8px 12px;text-align:left">Transaction Ref</th>
          <th style="padding:8px 12px;text-align:left">Retain Until</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p style="font-size:12px;color:#9ca3af;margin-top:16px">
      This report was generated automatically by the Aurum Operations Platform.<br/>
      To action a deletion: log in as COMPLIANCE_OFFICER → Documents → Flag for deletion.<br/>
      The final deletion must be confirmed by SUPER_ADMIN in the admin console.
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
    { eligibleCount: eligible.length, recipientCount: recipients.length },
    'Annual retention review report sent',
  );
}
