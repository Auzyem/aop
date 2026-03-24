import {
  SESClient,
  SendEmailCommand,
  SendRawEmailCommand,
  type SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import { logger } from '@aop/utils';
import type { IEmailProvider, EmailMessage, EmailSendResult } from './types.js';

// ---------------------------------------------------------------------------
// AWS SES live adapter
// ---------------------------------------------------------------------------

function buildSesClient(): SESClient {
  return new SESClient({
    region: process.env.AWS_REGION ?? 'eu-west-1',
    ...(process.env.AWS_ACCESS_KEY_ID && {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    }),
  });
}

const globalForSes = globalThis as unknown as { sesClient: SESClient | undefined };

function getSesClient(): SESClient {
  if (!globalForSes.sesClient) {
    globalForSes.sesClient = buildSesClient();
  }
  return globalForSes.sesClient;
}

const FROM = process.env.SES_FROM_ADDRESS ?? process.env.SMTP_FROM ?? 'noreply@aop.gold';
const MAX_RETRIES = 3;

async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class SesEmailProvider implements IEmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const toList = Array.isArray(message.to) ? message.to : [message.to];
    const ccList = message.cc ? (Array.isArray(message.cc) ? message.cc : [message.cc]) : undefined;
    const bccList = message.bcc
      ? Array.isArray(message.bcc)
        ? message.bcc
        : [message.bcc]
      : undefined;

    if (message.attachments && message.attachments.length > 0) {
      return this.sendRaw(message, toList, ccList, bccList);
    }

    const input: SendEmailCommandInput = {
      Source: FROM,
      Destination: {
        ToAddresses: toList,
        ...(ccList && { CcAddresses: ccList }),
        ...(bccList && { BccAddresses: bccList }),
      },
      Message: {
        Subject: { Data: message.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: message.textBody, Charset: 'UTF-8' },
          Html: { Data: message.htmlBody, Charset: 'UTF-8' },
        },
      },
    };

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await getSesClient().send(new SendEmailCommand(input));
        const messageId = result.MessageId ?? `ses-${Date.now()}`;
        logger.debug({ to: toList, subject: message.subject, messageId }, 'SES email sent');
        return { messageId, status: 'SENT' };
      } catch (err) {
        lastError = err;
        const delay = Math.pow(2, attempt - 1) * 1_000;
        logger.warn({ err, attempt, to: toList }, `SES send failed — retrying in ${delay}ms`);
        if (attempt < MAX_RETRIES) await sleep(delay);
      }
    }

    throw lastError;
  }

  private async sendRaw(
    message: EmailMessage,
    toList: string[],
    ccList: string[] | undefined,
    bccList: string[] | undefined,
  ): Promise<EmailSendResult> {
    // Build a minimal multipart MIME message manually
    const boundary = `AOP_${Date.now()}`;
    const lines: string[] = [
      `From: ${FROM}`,
      `To: ${toList.join(', ')}`,
      ...(ccList ? [`Cc: ${ccList.join(', ')}`] : []),
      ...(bccList ? [`Bcc: ${bccList.join(', ')}`] : []),
      `Subject: ${message.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: multipart/alternative; boundary="alt_boundary"',
      '',
      '--alt_boundary',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      message.textBody,
      '',
      '--alt_boundary',
      'Content-Type: text/html; charset=UTF-8',
      '',
      message.htmlBody,
      '',
      '--alt_boundary--',
    ];

    for (const att of message.attachments ?? []) {
      lines.push(
        `--${boundary}`,
        `Content-Type: ${att.contentType}`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${att.filename}"`,
        '',
        att.content.toString('base64'),
        '',
      );
    }
    lines.push(`--${boundary}--`);

    const rawMessage = lines.join('\r\n');

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await getSesClient().send(
          new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(rawMessage) } }),
        );
        const messageId = result.MessageId ?? `ses-raw-${Date.now()}`;
        return { messageId, status: 'SENT' };
      } catch (err) {
        lastError = err;
        const delay = Math.pow(2, attempt - 1) * 1_000;
        if (attempt < MAX_RETRIES) await sleep(delay);
      }
    }

    throw lastError;
  }
}
