// ---------------------------------------------------------------------------
// IEmailProvider — adapter contract for transactional email delivery
// ---------------------------------------------------------------------------

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  /** Fully-rendered HTML body */
  htmlBody: string;
  /** Plain-text fallback */
  textBody: string;
  attachments?: EmailAttachment[];
}

export type EmailStatus = 'SENT' | 'MOCK' | 'FAILED';

export interface EmailSendResult {
  messageId: string;
  status: EmailStatus;
}

export interface IEmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

// ---------------------------------------------------------------------------
// Template names — keeps callers type-safe
// ---------------------------------------------------------------------------
export const EMAIL_TEMPLATES = [
  'kyc-approved',
  'kyc-rejected',
  'kyc-renewal-reminder',
  'sanctions-hit',
  'disbursement-approved',
  'settlement-statement',
  'price-alert',
  'phase-advanced',
  'sla-breach',
] as const;

export type EmailTemplateName = (typeof EMAIL_TEMPLATES)[number];

// Per-template data shapes
export interface TemplateDataMap {
  'kyc-approved': { clientName: string; reviewedAt: string };
  'kyc-rejected': { clientName: string; reason: string; supportEmail: string };
  'kyc-renewal-reminder': { clientName: string; daysRemaining: number; renewalDeadline: string };
  'sanctions-hit': { clientName: string; clientId: string; screenedAt: string };
  'disbursement-approved': { agentName: string; amount: string; trancheNo: number; txnId: string };
  'settlement-statement': { txnId: string; clientName: string; netRemittanceUsd: string };
  'price-alert': {
    txnId: string;
    pct: string;
    direction: 'UP' | 'DOWN';
    oldPrice: string;
    newPrice: string;
  };
  'phase-advanced': { txnId: string; phase: string; advancedAt: string; advancedBy: string };
  'sla-breach': { txnId: string; phase: string; daysOverdue: number; enteredAt: string };
}
