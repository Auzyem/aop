import { logger } from '@aop/utils';
import type { ISmsProvider, SmsMessage, SmsSendResult } from './types.js';

// ---------------------------------------------------------------------------
// Africa's Talking live adapter
// Uses CommonJS package — require() is available in CJS / ts-node transpile mode
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _require: NodeRequire =
  typeof require !== 'undefined'
    ? require
    : (() => {
        throw new Error('require not available');
      })();

interface AfricasTalkingInstance {
  SMS: {
    send(opts: { to: string[]; message: string; from?: string }): Promise<{
      SMSMessageData: {
        Recipients: Array<{ messageId: string; status: string; cost: string }>;
      };
    }>;
  };
}

export class AfricasTalkingSmsProvider implements ISmsProvider {
  private sms: AfricasTalkingInstance['SMS'];

  constructor(username: string, apiKey: string) {
    const AfricasTalking = _require('africastalking') as (opts: {
      username: string;
      apiKey: string;
    }) => AfricasTalkingInstance;

    const at = AfricasTalking({ username, apiKey });
    this.sms = at.SMS;
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    try {
      const result = await this.sms.send({
        to: [message.to],
        message: message.body,
        ...(message.from && { from: message.from }),
      });

      const recipient = result.SMSMessageData.Recipients[0];
      const messageId = recipient?.messageId ?? `at-${Date.now()}`;
      const cost = recipient?.cost;

      logger.debug({ to: message.to, messageId, cost }, "Africa's Talking SMS sent");
      return { messageId, status: 'SENT', cost };
    } catch (err) {
      logger.error({ err, to: message.to }, "Africa's Talking SMS failed");
      throw err;
    }
  }
}
