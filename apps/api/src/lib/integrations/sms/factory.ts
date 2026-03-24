import { logger } from '@aop/utils';
import type { ISmsProvider } from './types.js';
import { AfricasTalkingSmsProvider } from './live.js';
import { MockSmsProvider } from './mock.js';

// ---------------------------------------------------------------------------
// Factory — uses Africa's Talking when credentials are present;
//           falls back to mock otherwise
// ---------------------------------------------------------------------------

let _instance: ISmsProvider | null = null;

export function getSmsProvider(): ISmsProvider {
  if (_instance) return _instance;

  const isTest = process.env.NODE_ENV === 'test';
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  const enabled = process.env.ENABLE_SMS === 'true';

  if (isTest || !enabled || !username || !apiKey) {
    if (!isTest && enabled && (!username || !apiKey)) {
      logger.warn('ENABLE_SMS=true but AT_USERNAME / AT_API_KEY not set — using MockSmsProvider');
    }
    _instance = new MockSmsProvider();
  } else {
    _instance = new AfricasTalkingSmsProvider(username, apiKey);
  }

  return _instance;
}

/** Reset singleton — for use in tests only */
export function _resetSmsProvider(): void {
  _instance = null;
}
