import { logger } from '@aop/utils';
import type { IFxRateProvider } from './types.js';
import { OpenExchangeRatesProvider } from './live.js';
import { MockFxRateProvider } from './mock.js';

// ---------------------------------------------------------------------------
// Factory — picks implementation based on NODE_ENV / env var presence
// ---------------------------------------------------------------------------

let _instance: IFxRateProvider | null = null;

export function getFxRateProvider(): IFxRateProvider {
  if (_instance) return _instance;

  const isTest = process.env.NODE_ENV === 'test';
  const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;

  if (isTest || !appId) {
    if (!isTest && !appId) {
      logger.warn('OPEN_EXCHANGE_RATES_APP_ID not set — using MockFxRateProvider');
    }
    _instance = new MockFxRateProvider();
  } else {
    _instance = new OpenExchangeRatesProvider(appId);
  }

  return _instance;
}

/** Reset singleton — for use in tests only */
export function _resetFxRateProvider(): void {
  _instance = null;
}
