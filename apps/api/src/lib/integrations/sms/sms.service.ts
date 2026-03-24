import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { getSmsProvider } from './factory.js';

// ---------------------------------------------------------------------------
// SmsService
// Feature-flagged SMS delivery with opt-in enforcement.
// ---------------------------------------------------------------------------

export interface RemittanceSmsParams {
  /** Client or miner phone number in E.164 format */
  toPhone: string;
  /** Transaction ID */
  txnId: string;
  /** Settlement amount in USD */
  amountUsd: number;
  /** Bank reference */
  bankRef: string;
  /** clientId — used to check smsOptIn */
  clientId?: string;
}

/**
 * Send the standard "remittance sent" SMS notification to the miner.
 * Only sends when:
 *  - ENABLE_SMS=true
 *  - client.smsOptIn is true (when clientId is provided)
 */
export async function sendRemittanceSms(params: RemittanceSmsParams): Promise<void> {
  if (process.env.ENABLE_SMS !== 'true') {
    logger.debug({ txnId: params.txnId }, 'SMS skipped — ENABLE_SMS not set');
    return;
  }

  // Check opt-in
  if (params.clientId) {
    const client = await prisma.client
      .findUnique({
        where: { id: params.clientId },
        select: { smsOptIn: true },
      })
      .catch(() => null);

    if (client && client.smsOptIn === false) {
      logger.debug(
        { clientId: params.clientId, txnId: params.txnId },
        'SMS skipped — client opted out',
      );
      return;
    }
  }

  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(params.amountUsd);

  const body =
    `Aurum Gold Finance: Your settlement of ${amount} for txn ${params.txnId} ` +
    `has been sent to your bank. Ref: ${params.bankRef}`;

  const provider = getSmsProvider();

  try {
    const result = await provider.send({ to: params.toPhone, body });
    logger.info(
      {
        txnId: params.txnId,
        to: params.toPhone,
        messageId: result.messageId,
        status: result.status,
      },
      'Remittance SMS sent',
    );
  } catch (err) {
    // SMS is best-effort — log but do not propagate
    logger.error({ err, txnId: params.txnId, to: params.toPhone }, 'Remittance SMS failed');
  }
}
