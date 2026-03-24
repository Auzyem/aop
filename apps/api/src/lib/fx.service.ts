import { redis } from './redis.js';
import { logger } from '@aop/utils';
import { getFxRateProvider } from './integrations/fx/factory.js';

// ---------------------------------------------------------------------------
// FX Rate Service
// Wraps the IFxRateProvider adapter with a Redis cache layer.
// The BullMQ daily scheduler (lib/integrations/fx/scheduler.ts) refreshes
// rates at 09:00 UTC each day and persists them to the DB.
// ---------------------------------------------------------------------------

const FX_CACHE_TTL_SEC = 25 * 60 * 60; // 25 hours (matches scheduler TTL)

export interface FxRates {
  base: 'USD';
  date: string;
  rates: Record<string, number>;
}

/**
 * Fetch (or return cached) FX rates for a given date (ISO YYYY-MM-DD).
 * Defaults to today.
 *
 * Cache hit → return from Redis
 * Cache miss → call IFxRateProvider (live API or mock), cache result
 */
export async function getDailyRates(date?: string): Promise<FxRates> {
  const d = date ?? new Date().toISOString().split('T')[0];
  const cacheKey = `fx:rates:${d}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as FxRates;
    }
  } catch (err) {
    logger.warn({ err }, 'Redis unavailable — skipping FX cache read');
  }

  const provider = getFxRateProvider();
  const data = await provider.getRates(d);
  const rates: FxRates = { base: 'USD', date: data.date, rates: data.rates };

  try {
    await redis.set(cacheKey, JSON.stringify(rates), 'EX', FX_CACHE_TTL_SEC);
  } catch (err) {
    logger.warn({ err }, 'Redis unavailable — FX rates not cached');
  }

  return rates;
}

/**
 * Pure function: convert an amount from a given currency to USD using a
 * rates map. Exported for unit testing without I/O.
 *
 * @param amount        Original currency amount
 * @param currency      ISO-4217 currency code
 * @param rates         Rate map keyed by currency code, values = units per 1 USD
 * @returns             { amountUsd, fxRate } where fxRate = rate used (1.0 if USD)
 */
export function convertAmountToUsd(
  amount: number,
  currency: string,
  rates: Record<string, number>,
): { amountUsd: number; fxRate: number } {
  if (currency === 'USD') return { amountUsd: amount, fxRate: 1.0 };

  const rate = rates[currency];
  if (!rate) {
    logger.warn(`FX rate for ${currency} not found — defaulting to 1.0`);
    return { amountUsd: amount, fxRate: 1.0 };
  }

  return { amountUsd: amount / rate, fxRate: rate };
}

/**
 * Async wrapper: fetch today's rates then convert.
 */
export async function convertToUsd(
  amount: number,
  currency: string,
): Promise<{ amountUsd: number; fxRate: number }> {
  if (currency === 'USD') return { amountUsd: amount, fxRate: 1.0 };
  const { rates } = await getDailyRates();
  return convertAmountToUsd(amount, currency, rates);
}
