import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { getEmailProvider } from './factory.js';
import { renderTemplate } from './template-renderer.js';
import type { EmailAttachment, EmailTemplateName, TemplateDataMap } from './types.js';

// ---------------------------------------------------------------------------
// EmailService
// High-level email service: template rendering + DB logging + retry via provider
// ---------------------------------------------------------------------------

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  htmlBody: string;
  textBody: string;
  attachments?: EmailAttachment[];
}

/** Send a fully-composed email (no template rendering) */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const provider = getEmailProvider();
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];

  let messageId: string | null = null;
  let status: 'SENT' | 'MOCK' | 'FAILED' = 'FAILED';
  let error: string | null = null;

  try {
    const result = await provider.send({
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      subject: opts.subject,
      htmlBody: opts.htmlBody,
      textBody: opts.textBody,
      attachments: opts.attachments,
    });
    messageId = result.messageId;
    status = result.status;
  } catch (err) {
    error = String(err);
    logger.error({ err, to: toList, subject: opts.subject }, 'EmailService: send failed');
  } finally {
    await logEmail({
      toAddress: toList.join(', '),
      subject: opts.subject,
      template: null,
      status,
      messageId,
      error,
    }).catch((logErr) => {
      logger.warn({ logErr }, 'EmailService: failed to write EmailLog');
    });
  }
}

/** Render a named template and send */
export async function sendTemplatedEmail<T extends EmailTemplateName>(
  templateName: T,
  data: TemplateDataMap[T],
  opts: Omit<SendEmailOptions, 'htmlBody' | 'textBody'>,
): Promise<void> {
  const { html, text } = renderTemplate(templateName, data as unknown as Record<string, unknown>);

  const provider = getEmailProvider();
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];

  let messageId: string | null = null;
  let status: 'SENT' | 'MOCK' | 'FAILED' = 'FAILED';
  let error: string | null = null;

  try {
    const result = await provider.send({
      ...opts,
      htmlBody: html,
      textBody: text,
    });
    messageId = result.messageId;
    status = result.status;
  } catch (err) {
    error = String(err);
    logger.error(
      { err, to: toList, template: templateName },
      'EmailService: templated send failed',
    );
  } finally {
    await logEmail({
      toAddress: toList.join(', '),
      subject: opts.subject,
      template: templateName,
      status,
      messageId,
      error,
    }).catch((logErr) => {
      logger.warn({ logErr }, 'EmailService: failed to write EmailLog');
    });
  }
}

// ---------------------------------------------------------------------------
// DB logging
// ---------------------------------------------------------------------------

async function logEmail(entry: {
  toAddress: string;
  subject: string;
  template: string | null;
  status: string;
  messageId: string | null;
  error: string | null;
}) {
  await prisma.emailLog.create({ data: entry });
}
