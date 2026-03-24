'use client';
import { useState } from 'react';

const FX_RATES: Record<string, number> = { KES: 130, UGX: 3700, TZS: 2500, ZAR: 18.5 };
const CURRENCIES = ['USD', 'KES', 'UGX', 'TZS', 'ZAR'] as const;

export function CurrencyAmount({
  amountUsd,
  defaultCurrency = 'USD',
}: {
  amountUsd: number;
  defaultCurrency?: string;
}) {
  const [currency, setCurrency] = useState(defaultCurrency);
  const amount = currency === 'USD' ? amountUsd : amountUsd * (FX_RATES[currency] ?? 1);
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <span className="font-mono inline-flex items-center gap-1">
      <button
        onClick={() => {
          const idx = CURRENCIES.indexOf(currency as (typeof CURRENCIES)[number]);
          setCurrency(CURRENCIES[(idx + 1) % CURRENCIES.length]);
        }}
        className="text-xs text-gray-400 hover:text-gold transition-colors"
        title="Toggle currency"
      >
        {currency}
      </button>
      {formatted}
    </span>
  );
}
