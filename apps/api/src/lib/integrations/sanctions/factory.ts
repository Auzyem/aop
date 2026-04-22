import { logger } from '@aop/utils';
import type { ISanctionsProvider } from './types.js';
import { DilisenseSanctionsProvider } from './dilisense.js';
import { MockSanctionsProvider } from './mock.js';

// ---------------------------------------------------------------------------
// Factory — picks the implementation based on environment / API key presence
// ---------------------------------------------------------------------------

let _instance: ISanctionsProvider | null = null;

export function getSanctionsProvider(): ISanctionsProvider {
  if (_instance) return _instance;

  const isTest = process.env.NODE_ENV === 'test';
  const apiKey = process.env.DILISENSE_API_KEY;

  if (isTest || !apiKey) {
    if (!isTest && !apiKey) {
      logger.warn('DILISENSE_API_KEY not set — using MockSanctionsProvider');
    }
    _instance = new MockSanctionsProvider();
  } else {
    _instance = new DilisenseSanctionsProvider(apiKey);
  }

  return _instance;
}

/** Reset singleton — for use in tests only */
export function _resetSanctionsProvider(): void {
  _instance = null;
}
