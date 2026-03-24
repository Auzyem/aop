import { logger } from '@aop/utils';
import type { ISmsProvider, SmsMessage, SmsSendResult } from './types.js';

// ---------------------------------------------------------------------------
// Mock SMS provider — logs to console, never sends
// ---------------------------------------------------------------------------

export class MockSmsProvider implements ISmsProvider {
  async send(message: SmsMessage): Promise<SmsSendResult> {
    const messageId = `mock-sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    logger.info({ messageId, to: message.to, body: message.body }, '[MockSMS] SMS would be sent');

    return { messageId, status: 'MOCK', cost: '0.0000' };
  }
}
