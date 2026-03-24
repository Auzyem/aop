// ---------------------------------------------------------------------------
// External service integrations — barrel export
// ---------------------------------------------------------------------------

// Sanctions
export type {
  ISanctionsProvider,
  SanctionsSearchParams,
  SanctionsSearchResult,
} from './sanctions/types.js';
export { getSanctionsProvider, _resetSanctionsProvider } from './sanctions/factory.js';
export { ComplyAdvantageSanctionsProvider } from './sanctions/live.js';
export { MockSanctionsProvider } from './sanctions/mock.js';

// FX rates
export type { IFxRateProvider, FxRateData, SupportedCurrency } from './fx/types.js';
export { SUPPORTED_CURRENCIES } from './fx/types.js';
export { getFxRateProvider, _resetFxRateProvider } from './fx/factory.js';
export { OpenExchangeRatesProvider } from './fx/live.js';
export { MockFxRateProvider } from './fx/mock.js';
export { initFxRateScheduler, shutdownFxRateScheduler, triggerFxFetchNow } from './fx/scheduler.js';

// Email
export type {
  IEmailProvider,
  EmailMessage,
  EmailAttachment,
  EmailTemplateName,
  TemplateDataMap,
} from './email/types.js';
export { EMAIL_TEMPLATES } from './email/types.js';
export { getEmailProvider, _resetEmailProvider } from './email/factory.js';
export { SesEmailProvider } from './email/ses.live.js';
export { MockEmailProvider } from './email/mock.js';
export { sendEmail, sendTemplatedEmail } from './email/email.service.js';
export { renderTemplate } from './email/template-renderer.js';

// SMS
export type { ISmsProvider, SmsMessage, SmsSendResult } from './sms/types.js';
export { getSmsProvider, _resetSmsProvider } from './sms/factory.js';
export { AfricasTalkingSmsProvider } from './sms/live.js';
export { MockSmsProvider } from './sms/mock.js';
export { sendRemittanceSms } from './sms/sms.service.js';
