// ---------------------------------------------------------------------------
// IFxRateProvider — adapter contract for FX rate data sources
// ---------------------------------------------------------------------------

export interface FxRateData {
  /** ISO date YYYY-MM-DD this rate set was fetched for */
  date: string;
  /**
   * Map of currency code → units of that currency per 1 USD
   * e.g. { UGX: 3800, ZAR: 18.5 }
   */
  rates: Record<string, number>;
}

export interface IFxRateProvider {
  /**
   * Fetch the full rate map for a given date.
   * @param date  ISO date YYYY-MM-DD; defaults to today when omitted
   */
  getRates(date?: string): Promise<FxRateData>;
}

/** Supported currencies for East/Southern Africa operations */
export const SUPPORTED_CURRENCIES = [
  'UGX',
  'TZS',
  'KES',
  'RWF',
  'BIF',
  'CDF',
  'ZAR',
  'EUR',
  'GBP',
  'AED',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
