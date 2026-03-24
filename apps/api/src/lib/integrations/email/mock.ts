import { logger } from '@aop/utils';
import type { IEmailProvider, EmailMessage, EmailSendResult } from './types.js';

// ---------------------------------------------------------------------------
// Mock email provider — logs to console, never sends
// ---------------------------------------------------------------------------

export class MockEmailProvider implements IEmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const toList = Array.isArray(message.to) ? message.to : [message.to];
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    logger.info(
      {
        messageId,
        to: toList,
        subject: message.subject,
        attachments: (message.attachments ?? []).map((a) => a.filename),
      },
      '[MockEmail] Email would be sent',
    );

    return { messageId, status: 'MOCK' };
  }
}
