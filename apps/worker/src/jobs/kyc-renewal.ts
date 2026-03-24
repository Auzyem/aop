import type { Job } from 'bullmq';
import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import nodemailer from 'nodemailer';

// ---------------------------------------------------------------------------
// Mailer (worker-local — mirrors apps/api/src/lib/mailer.ts pattern)
// ---------------------------------------------------------------------------

function buildTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
      : undefined,
  });
}

const transporter = buildTransporter();
const FROM = process.env.SMTP_FROM ?? 'noreply@aop.local';

async function sendMail(to: string | string[], subject: string, text: string) {
  if (!transporter) {
    logger.warn({ to, subject }, 'Email not sent — SMTP not configured');
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, text });
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send renewal reminder email');
  }
}

// ---------------------------------------------------------------------------
// KYC renewal reminder processor
// ---------------------------------------------------------------------------

export async function kycRenewalProcessor(_job: Job): Promise<void> {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Find KYC records expiring within 30 days
  const expiringRecords = await prisma.kycRecord.findMany({
    where: {
      status: 'APPROVED',
      retainUntil: {
        gte: now,
        lte: thirtyDaysFromNow,
      },
    },
    include: {
      client: {
        include: {
          assignedAgent: {
            include: {
              users: {
                where: { isActive: true },
                select: { email: true },
              },
            },
          },
        },
      },
    },
  });

  if (expiringRecords.length === 0) {
    logger.info('KYC renewal check: no expiring documents found');
    return;
  }

  // Deduplicate by clientId
  const clientMap = new Map<string, (typeof expiringRecords)[0]['client']>();
  for (const record of expiringRecords) {
    if (!clientMap.has(record.clientId)) {
      clientMap.set(record.clientId, record.client);
    }
  }

  // Load all COMPLIANCE_OFFICER emails once
  const complianceUsers = await prisma.user.findMany({
    where: { role: 'COMPLIANCE_OFFICER', isActive: true },
    select: { email: true },
  });
  const complianceEmails = complianceUsers.map((u) => u.email);

  let emailsSent = 0;

  for (const [clientId, client] of clientMap) {
    const clientName = client.fullName;
    const subject = `[AOP] KYC Document Expiring Soon — ${clientName}`;
    const text = `One or more KYC documents for client "${clientName}" (ID: ${clientId}) are due to expire within 30 days.\n\nPlease arrange for renewed documents to be submitted and approved before expiry.`;

    // Notify agent
    const agentEmails = client.assignedAgent?.users.map((u: { email: string }) => u.email) ?? [];
    if (agentEmails.length > 0) {
      await sendMail(agentEmails, subject, text);
      emailsSent++;
    }

    // Notify compliance
    if (complianceEmails.length > 0) {
      await sendMail(complianceEmails, subject, text);
      emailsSent++;
    }
  }

  logger.info({ affectedClients: clientMap.size, emailsSent }, 'KYC renewal reminder job complete');
}
