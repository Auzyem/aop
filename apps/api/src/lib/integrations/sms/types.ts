// ---------------------------------------------------------------------------
// ISmsProvider — adapter contract for SMS/WhatsApp delivery
// ---------------------------------------------------------------------------

export interface SmsMessage {
  /** E.164 international phone number e.g. +256700000000 */
  to: string;
  body: string;
  /** Sender ID; defaults to provider-level default */
  from?: string;
}

export type SmsStatus = 'SENT' | 'MOCK' | 'FAILED';

export interface SmsSendResult {
  messageId: string;
  status: SmsStatus;
  /** Provider-reported cost string e.g. "UGX 22.0000" */
  cost?: string;
}

export interface ISmsProvider {
  send(message: SmsMessage): Promise<SmsSendResult>;
}
