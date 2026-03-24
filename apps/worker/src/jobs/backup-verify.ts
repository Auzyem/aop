/**
 * Weekly backup verification job.
 *
 * Runs every Saturday at 06:00 UTC.
 *
 * Steps:
 *  1. Verify that an RDS automated snapshot was created within the last 24 h.
 *  2. Query live DB record counts (transactions, audit_events, clients).
 *  3. Compare to the previous week's baseline stored in SystemSettings.
 *  4. Email ADMIN/SUPER_ADMIN users with a PASSED/FAILED report.
 *  5. Update the baseline in SystemSettings.
 *
 * NOTE: A full restore-to-point-in-time validation requires separate AWS
 * infrastructure (an isolated VPC + test RDS instance). This job covers the
 * "existence + count sanity" layer. The full restore test should be run
 * quarterly by the DBA following the procedure in RUNBOOK.md.
 */

import type { Job } from 'bullmq';
import { DescribeDBSnapshotsCommand, RDSClient } from '@aws-sdk/client-rds';
import nodemailer from 'nodemailer';
import { prisma } from '@aop/db';
import { logger } from '@aop/utils';

export const BACKUP_VERIFY_CRON = '0 6 * * 6'; // 06:00 UTC every Saturday

const BASELINE_KEY = 'backup_verify_baseline';

// ---------------------------------------------------------------------------
// Helpers
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

interface CountBaseline {
  transactions: number;
  auditEvents: number;
  clients: number;
  recordedAt: string;
}

// ---------------------------------------------------------------------------
// RDS snapshot check
// ---------------------------------------------------------------------------

async function verifyRdsSnapshot(): Promise<{ ok: boolean; detail: string }> {
  const dbInstanceId = process.env.RDS_INSTANCE_ID;
  if (!dbInstanceId) {
    return { ok: false, detail: 'RDS_INSTANCE_ID env var not set — skipping snapshot check' };
  }

  try {
    const rds = new RDSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    const resp = await rds.send(
      new DescribeDBSnapshotsCommand({
        DBInstanceIdentifier: dbInstanceId,
        SnapshotType: 'automated',
        MaxRecords: 5,
      }),
    );

    const snapshots = resp.DBSnapshots ?? [];
    if (snapshots.length === 0) {
      return { ok: false, detail: 'No automated snapshots found' };
    }

    // Sort by creation time descending
    const sorted = [...snapshots].sort(
      (a, b) => (b.SnapshotCreateTime?.getTime() ?? 0) - (a.SnapshotCreateTime?.getTime() ?? 0),
    );

    const latest = sorted[0];
    const ageMs = Date.now() - (latest.SnapshotCreateTime?.getTime() ?? 0);
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours > 26) {
      return {
        ok: false,
        detail: `Most recent snapshot is ${ageHours.toFixed(1)}h old (expected < 26h). Snapshot: ${latest.DBSnapshotIdentifier}`,
      };
    }

    return {
      ok: true,
      detail: `Snapshot ${latest.DBSnapshotIdentifier} created ${ageHours.toFixed(1)}h ago (${latest.Status})`,
    };
  } catch (err) {
    return { ok: false, detail: `RDS describe-snapshots failed: ${String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Record count check
// ---------------------------------------------------------------------------

async function verifyRecordCounts(): Promise<{
  ok: boolean;
  detail: string;
  current: CountBaseline;
}> {
  const [txCount, auditCount, clientCount] = await Promise.all([
    prisma.transaction.count(),
    prisma.auditEvent.count(),
    prisma.client.count(),
  ]);

  const current: CountBaseline = {
    transactions: txCount,
    auditEvents: auditCount,
    clients: clientCount,
    recordedAt: new Date().toISOString(),
  };

  // Load last week's baseline from SystemSettings
  const setting = await prisma.systemSettings.findUnique({ where: { key: BASELINE_KEY } });
  if (!setting) {
    return {
      ok: true,
      detail: 'No prior baseline — establishing baseline this run',
      current,
    };
  }

  const baseline = setting.value as unknown as CountBaseline;
  const issues: string[] = [];

  // Flag if counts dropped by more than 1% (catches accidental bulk deletes)
  const threshold = 0.01;
  if (txCount < baseline.transactions * (1 - threshold)) {
    issues.push(`Transaction count dropped: ${baseline.transactions} → ${txCount}`);
  }
  if (auditCount < baseline.auditEvents * (1 - threshold)) {
    issues.push(`AuditEvent count dropped: ${baseline.auditEvents} → ${auditCount}`);
  }
  if (clientCount < baseline.clients * (1 - threshold)) {
    issues.push(`Client count dropped: ${baseline.clients} → ${clientCount}`);
  }

  if (issues.length > 0) {
    return { ok: false, detail: issues.join('; '), current };
  }

  return {
    ok: true,
    detail: `Transactions: ${txCount} (+${txCount - baseline.transactions}), AuditEvents: ${auditCount} (+${auditCount - baseline.auditEvents}), Clients: ${clientCount} (+${clientCount - baseline.clients})`,
    current,
  };
}

// ---------------------------------------------------------------------------
// Email report
// ---------------------------------------------------------------------------

async function sendReport(passed: boolean, details: string[]): Promise<void> {
  const recipients = await prisma.user.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
    select: { email: true },
  });

  if (!recipients.length) {
    logger.warn('Backup verify: no ADMIN recipients found for report email');
    return;
  }

  const status = passed ? 'PASSED' : 'FAILED';
  const colour = passed ? '#059669' : '#dc2626';
  const subject = `[AOP] Weekly backup verification: ${status} — ${new Date().toISOString().slice(0, 10)}`;

  const rows = details
    .map(
      (d) => `<tr><td style="padding:6px 0;font-family:sans-serif;font-size:14px">${d}</td></tr>`,
    )
    .join('');

  const html = `
    <h2 style="color:${colour}">Weekly Backup Verification: ${status}</h2>
    <table style="border-collapse:collapse;width:100%;max-width:600px">
      ${rows}
    </table>
    <p style="font-size:12px;color:#9ca3af;margin-top:16px">
      Generated by the Aurum Operations Platform backup-verify worker.<br/>
      For the full restore-to-point-in-time procedure see RUNBOOK.md.
    </p>
  `;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'noreply@aop.local',
    to: recipients.map((r) => r.email).join(', '),
    subject,
    html,
  });

  logger.info({ recipientCount: recipients.length, status }, 'Backup verification report sent');
}

// ---------------------------------------------------------------------------
// Main processor
// ---------------------------------------------------------------------------

export async function backupVerifyProcessor(_job: Job): Promise<void> {
  logger.info('Starting weekly backup verification');

  const [snapshotResult, countResult] = await Promise.all([
    verifyRdsSnapshot(),
    verifyRecordCounts(),
  ]);

  const passed = snapshotResult.ok && countResult.ok;

  const details = [
    `<strong>RDS Snapshot check:</strong> ${snapshotResult.ok ? '✓' : '✗'} ${snapshotResult.detail}`,
    `<strong>Record count check:</strong> ${countResult.ok ? '✓' : '✗'} ${countResult.detail}`,
    `<strong>Verified at:</strong> ${new Date().toUTCString()}`,
  ];

  // Update baseline (regardless of pass/fail — we always record current counts)
  await prisma.systemSettings
    .upsert({
      where: { key: BASELINE_KEY },
      update: { value: countResult.current as any, updatedAt: new Date() },
      create: { key: BASELINE_KEY, value: countResult.current as any },
    })
    .catch((err) => logger.error({ err }, 'Failed to update backup verify baseline'));

  await sendReport(passed, details);

  if (!passed) {
    const msg = `Backup verification FAILED: ${[snapshotResult, countResult]
      .filter((r) => !r.ok)
      .map((r) => r.detail)
      .join(' | ')}`;
    logger.error(msg);
    throw new Error(msg); // Mark job as failed so BullMQ retries and alerts are visible
  }

  logger.info('Weekly backup verification PASSED');
}
