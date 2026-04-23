import { prisma } from '@aop/db';
import type { AuthenticatedUser } from '@aop/types';
import { getCurrentLmePrice } from './lme-feed.service.js';

export async function getTradeDeskDashboard(_actor: AuthenticatedUser) {
  const [currentPrice, latestAmFix, latestPmFix, activeTxns] = await Promise.all([
    getCurrentLmePrice(),
    prisma.lmePriceRecord.findFirst({
      where: { priceType: 'AM_FIX' },
      orderBy: { recordedAt: 'desc' },
      select: { priceUsdPerTroyOz: true, recordedAt: true },
    }),
    prisma.lmePriceRecord.findFirst({
      where: { priceType: 'PM_FIX' },
      orderBy: { recordedAt: 'desc' },
      select: { priceUsdPerTroyOz: true, recordedAt: true },
    }),
    prisma.transaction.findMany({
      where: { status: { notIn: ['CANCELLED', 'SETTLED'] } },
      include: {
        client: { select: { fullName: true, countryCode: true } },
        agent: { select: { companyName: true } },
        costItems: { select: { estimatedUsd: true } },
      },
    }),
  ]);

  const phaseCount: Record<string, number> = {};
  let priceLocked = 0;
  let priceUnlocked = 0;
  let totalExposureUsd = 0;

  for (const tx of activeTxns) {
    phaseCount[tx.phase] = (phaseCount[tx.phase] ?? 0) + 1;
    if (tx.lmePriceLocked) {
      priceLocked += 1;
    } else {
      priceUnlocked += 1;
    }
    totalExposureUsd += tx.costItems.reduce(
      (s, c) => s + (c.estimatedUsd ? Number(c.estimatedUsd) : 0),
      0,
    );
  }

  return {
    currentPrices: {
      SPOT: currentPrice ? { price: Number(currentPrice.priceUsdPerTroyOz) } : null,
      AM_FIX: latestAmFix ? { price: Number(latestAmFix.priceUsdPerTroyOz) } : null,
      PM_FIX: latestPmFix ? { price: Number(latestPmFix.priceUsdPerTroyOz) } : null,
    },
    activeTransactions: {
      total: activeTxns.length,
      byPhase: phaseCount,
      priceLocked,
      priceUnlocked,
    },
    totalExposureUsd,
  };
}
