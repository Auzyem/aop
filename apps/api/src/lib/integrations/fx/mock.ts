import type { IFxRateProvider, FxRateData } from './types.js';

// ---------------------------------------------------------------------------
// Mock FX rate provider — hardcoded approximate rates (units per 1 USD)
// ---------------------------------------------------------------------------

const MOCK_RATES: Record<string, number> = {
  // East Africa
  UGX: 3_800,
  TZS: 2_600,
  KES: 130,
  RWF: 1_300,
  BIF: 2_900,
  CDF: 2_800,
  // Southern Africa
  ZAR: 18.5,
  // International
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
};

export class MockFxRateProvider implements IFxRateProvider {
  async getRates(date?: string): Promise<FxRateData> {
    return {
      date: date ?? new Date().toISOString().split('T')[0],
      rates: { ...MOCK_RATES },
    };
  }
}
