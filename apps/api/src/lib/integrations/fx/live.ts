import axios from 'axios';
import { logger } from '@aop/utils';
import type { IFxRateProvider, FxRateData } from './types.js';

// ---------------------------------------------------------------------------
// Open Exchange Rates live adapter
// GET https://openexchangerates.org/api/latest.json?app_id={key}
// ---------------------------------------------------------------------------

export class OpenExchangeRatesProvider implements IFxRateProvider {
  private readonly appId: string;

  constructor(appId: string) {
    this.appId = appId;
  }

  async getRates(date?: string): Promise<FxRateData> {
    // 'latest' endpoint always returns the current rates; we ignore date for now
    // (historical endpoint requires a paid plan)
    const url = `https://openexchangerates.org/api/latest.json`;

    const response = await axios.get<{
      base: string;
      timestamp: number;
      rates: Record<string, number>;
    }>(url, {
      params: { app_id: this.appId, base: 'USD' },
      timeout: 10_000,
    });

    const d = date ?? new Date().toISOString().split('T')[0];

    logger.debug(
      { currencies: Object.keys(response.data.rates).length, date: d },
      'Open Exchange Rates fetch complete',
    );

    return { date: d, rates: response.data.rates };
  }
}
