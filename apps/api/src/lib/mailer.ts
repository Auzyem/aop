import { sendEmail } from './integrations/email/email.service.js';

// ---------------------------------------------------------------------------
// Legacy sendMail shim
// Delegates to the email service (SES in production, mock in dev/test).
// Kept for backward compatibility — prefer sendEmail / sendTemplatedEmail
// from lib/integrations/email/email.service.ts for new code.
// ---------------------------------------------------------------------------

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

export async function sendMail(opts: MailOptions): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: opts.subject,
    textBody: opts.text,
    htmlBody: opts.html ?? `<pre style="font-family:sans-serif">${opts.text}</pre>`,
    attachments: opts.attachments,
  });
}
