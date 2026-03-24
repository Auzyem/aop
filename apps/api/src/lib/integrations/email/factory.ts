import { logger } from '@aop/utils';
import type { IEmailProvider } from './types.js';
import { SesEmailProvider } from './ses.live.js';
import { MockEmailProvider } from './mock.js';

// ---------------------------------------------------------------------------
// Factory — picks SES when SES_FROM_ADDRESS is set; otherwise mock
// ---------------------------------------------------------------------------

let _instance: IEmailProvider | null = null;

export function getEmailProvider(): IEmailProvider {
  if (_instance) return _instance;

  const isTest = process.env.NODE_ENV === 'test';
  const sesFrom = process.env.SES_FROM_ADDRESS;

  if (isTest || !sesFrom) {
    if (!isTest && !sesFrom) {
      logger.warn('SES_FROM_ADDRESS not set — using MockEmailProvider');
    }
    _instance = new MockEmailProvider();
  } else {
    _instance = new SesEmailProvider();
  }

  return _instance;
}

/** Reset singleton — for use in tests only */
export function _resetEmailProvider(): void {
  _instance = null;
}
