'use client';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import type { LmePriceData } from '../../lib/websocket';

interface LMEPriceBadgeProps {
  price: LmePriceData | null;
  previousPrice?: number;
}

export function LMEPriceBadge({ price, previousPrice }: LMEPriceBadgeProps) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (price && previousPrice && price.priceUsdPerTroyOz !== previousPrice) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1500);
      return () => clearTimeout(t);
    }
  }, [price, previousPrice]);

  if (!price) {
    return (
      <div className="flex items-center gap-2 bg-aop-navy/10 rounded-lg px-3 py-1.5">
        <div className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-sm text-gray-500">LME Loading...</span>
      </div>
    );
  }

  const change = previousPrice
    ? ((price.priceUsdPerTroyOz - previousPrice) / previousPrice) * 100
    : 0;
  const isUp = change > 0;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors duration-300',
        'bg-aop-navy/10',
        pulse && 'bg-gold-light',
        price.stale && 'opacity-60',
      )}
    >
      <div className={cn('w-2 h-2 rounded-full', price.stale ? 'bg-gray-400' : 'bg-green-500')} />
      <span className="text-sm font-mono font-semibold text-aop-dark">
        USD{' '}
        {price.priceUsdPerTroyOz.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
        /toz
      </span>
      {change !== 0 && (
        <span className={cn('text-xs font-medium', isUp ? 'text-green-600' : 'text-red-600')}>
          {isUp ? '↑' : '↓'} {Math.abs(change).toFixed(2)}%
        </span>
      )}
      {price.stale && <span className="text-xs text-gray-400">(stale)</span>}
    </div>
  );
}
