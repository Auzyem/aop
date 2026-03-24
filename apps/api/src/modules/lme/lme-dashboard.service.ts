import { prisma } from '@aop/db';
import type { AuthenticatedUser } from '@aop/types';
import { getCurrentLmePrice } from './lme-feed.service.js';

export async function getTradeDeskDashboard(_actor: AuthenticatedUser) {
  const [currentPrice, activeTxns, recentPrices] = await Promise.all([
    getCurrentLmePrice(),
    prisma.transaction.findMany({
      where: { status: { notIn: ['CANCELLED', 'SETTLED'] } },
      include: {
        client: { select: { fullName: true, countryCode: true } },
        agent: { select: { companyName: true } },
        costItems: { select: { estimatedUsd: true } },
      },
    }),
    prisma.lmePriceRecord.findMany({
      orderBy: { recordedAt: 'desc' },
      take: 7 * 24 * 12, // ~7 days of 5-min intervals
      select: { priceUsdPerTroyOz: true, recordedAt: true, priceType: true },
    }),
  ]);

  // Phase breakdown
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
    // Rough exposure: sum of estimated costs
    totalExposureUsd += tx.costItems.reduce(
      (s, c) => s + (c.estimatedUsd ? Number(c.estimatedUsd) : 0),
      0,
    );
  }

  return {
    currentPrice,
    activeTransactions: {
      total: activeTxns.length,
      byPhase: phaseCount,
      priceLocked,
      priceUnlocked,
    },
    totalExposureUsd,
    priceHistory: recentPrices.map((r) => ({
      price: Number(r.priceUsdPerTroyOz),
      recordedAt: r.recordedAt.toISOString(),
      priceType: r.priceType,
    })),
  };
}
