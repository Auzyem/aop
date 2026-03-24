import type { Job, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import axios from 'axios';
import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { TROY_OZ_PER_GRAM } from '@aop/utils';
import type { EmailJobData } from './email.processor.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LME_CACHE_KEY = 'lme:price:current';
const LME_PUBSUB_CHANNEL = 'lme:price:update';
const LME_CACHE_TTL_SEC = 90;
const OFF_HOURS_INTERVAL_SEC = 15 * 60; // 15 minutes

const PRICE_ALERT_THRESHOLD_PCT = Number(process.env.PRICE_ALERT_THRESHOLD_PCT ?? 2);

// ---------------------------------------------------------------------------
// Market hours detection — Mon–Fri 06:00–16:30 London time (handles DST)
// ---------------------------------------------------------------------------

export function isMarketHours(now: Date = new Date()): boolean {
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  if (utcDay === 0 || utcDay === 6) return false;

  // Resolve London local time so BST/GMT switchover is handled automatically
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
  const londonMinutes = hour * 60 + minute;

  // LME trading session: 06:00–16:30 London time (inclusive)
  return londonMinutes >= 6 * 60 && londonMinutes <= 16 * 60 + 30;
}

// ---------------------------------------------------------------------------
// metals.dev integration
// ---------------------------------------------------------------------------

interface MetalsDevResponse {
  status: string; // 'success' | 'error'
  currency: string; // 'USD'
  unit: string; // 'kg'
  metals: {
    gold: number; // USD per kg
    [key: string]: number;
  };
  timestamp: number; // Unix epoch seconds
}

/**
 * Fetch spot gold price from metals.dev.
 * Returns price in USD per troy oz (converted from USD per kg).
 *
 * Conversion: pricePerTroyOz = pricePerKg × (TROY_OZ_PER_GRAM / 1000)
 *   because 1 kg = 1000 g = 1000 / 31.1035 troy oz ≈ 32.1507 troy oz
 *   so: $/troy oz = ($/kg) × (31.1035 g/troy oz) / (1000 g/kg)
 */
async function fetchFromMetalsDev(): Promise<{ priceUsd: number; timestamp: Date } | null> {
  const apiKey = process.env.METALS_DEV_API_KEY;
  if (!apiKey) {
    logger.warn('METALS_DEV_API_KEY not set — skipping metals.dev fetch');
    return null;
  }

  const resp = await axios.get<MetalsDevResponse>(
    `https://api.metals.dev/v1/latest?api_key=${apiKey}&currency=USD&unit=kg`,
    { timeout: 10_000 },
  );

  if (resp.data.status !== 'success' || typeof resp.data.metals?.gold !== 'number') {
    logger.warn({ data: resp.data }, 'metals.dev returned unsuccessful response');
    return null;
  }

  // Convert USD/kg → USD/troy oz
  const priceUsd = resp.data.metals.gold * (TROY_OZ_PER_GRAM / 1000);
  return { priceUsd, timestamp: new Date(resp.data.timestamp * 1000) };
}

// ---------------------------------------------------------------------------
// Alert check
// ---------------------------------------------------------------------------

async function runAlertChecks(
  newPrice: number,
  publisher: Redis,
  emailQueue: Queue<EmailJobData>,
): Promise<void> {
  try {
    const activeTxns = await prisma.transaction.findMany({
      where: {
        phase: { in: ['PHASE_3', 'PHASE_4', 'PHASE_5', 'PHASE_6'] },
        status: { notIn: ['CANCELLED', 'SETTLED'] },
      },
      include: {
        client: { select: { fullName: true } },
        costItems: { select: { estimatedUsd: true } },
      },
    });

    for (const tx of activeTxns) {
      // Reference price: lmePriceLocked if available, else price at creation time
      let refPrice: number | null = null;
      if (tx.lmePriceLocked) {
        refPrice = Number(tx.lmePriceLocked);
      } else {
        const priceAtCreation = await prisma.lmePriceRecord.findFirst({
          where: { recordedAt: { lte: tx.createdAt } },
          orderBy: { recordedAt: 'desc' },
        });
        refPrice = priceAtCreation ? Number(priceAtCreation.priceUsdPerTroyOz) : null;
      }

      if (!refPrice) continue;

      const changePct = Math.abs((newPrice - refPrice) / refPrice) * 100;
      if (changePct < PRICE_ALERT_THRESHOLD_PCT) continue;

      const fineWeightTroyOz = tx.goldWeightFine
        ? Number(tx.goldWeightFine) / TROY_OZ_PER_GRAM
        : Number(tx.goldWeightGross) / TROY_OZ_PER_GRAM;
      const exposureUsd = fineWeightTroyOz * newPrice;

      const direction: 'UP' | 'DOWN' = newPrice > refPrice ? 'UP' : 'DOWN';
      const alertedAt = new Date().toISOString();
      const alertPayload = {
        transactionId: tx.id,
        clientName: tx.client.fullName,
        referencePriceUsd: refPrice,
        newPriceUsd: newPrice,
        changePct: changePct.toFixed(2),
        direction,
        exposureUsd: exposureUsd.toFixed(2),
        alertedAt,
      };

      // Persist a PriceAlert record
      let alertId = '';
      try {
        const alertRecord = await prisma.priceAlert.create({
          data: {
            transactionId: tx.id,
            referencePriceUsd: refPrice,
            newPriceUsd: newPrice,
            changePct: changePct,
            direction,
            exposureUsd: exposureUsd,
            emailSent: false,
          },
        });
        alertId = alertRecord.id;
      } catch (err) {
        logger.error({ err, transactionId: tx.id }, 'Failed to create PriceAlert record');
      }

      // Enqueue email notification
      emailQueue
        .add(
          'lme-price-alert',
          {
            type: 'lme-price-alert',
            alertId,
            transactionId: tx.id,
            clientName: tx.client.fullName,
            referencePriceUsd: refPrice,
            newPriceUsd: newPrice,
            changePct: changePct.toFixed(2),
            direction,
            exposureUsd: exposureUsd.toFixed(2),
            alertedAt,
          },
          { removeOnComplete: 10, removeOnFail: 5 },
        )
        .catch((err) =>
          logger.warn({ err, transactionId: tx.id }, 'Failed to enqueue alert email'),
        );

      // Publish alert to WebSocket channel
      publisher.publish('lme:price:alert', JSON.stringify(alertPayload)).catch(() => {});

      logger.warn(alertPayload, 'LME price alert triggered');
    }
  } catch (err) {
    logger.error({ err }, 'Error running LME price alert checks');
  }
}

// ---------------------------------------------------------------------------
// Job data shape
// ---------------------------------------------------------------------------

export interface LmePollJobData {
  /** Set for scheduled fix captures: 'AM_FIX' | 'PM_FIX'. Absent for SPOT polls. */
  priceType?: 'AM_FIX' | 'PM_FIX';
}

// ---------------------------------------------------------------------------
// Processor factory — call with the shared Redis connection
// ---------------------------------------------------------------------------

export function createLmePollerProcessor(
  connection: Redis,
  emailQueue: Queue<EmailJobData>,
): (job: Job<LmePollJobData>) => Promise<void> {
  return async (job: Job<LmePollJobData>) => {
    const now = new Date();
    const inMarketHours = isMarketHours(now);
    // Scheduled fix captures always run regardless of market hours check
    const isFixCapture = job.data?.priceType === 'AM_FIX' || job.data?.priceType === 'PM_FIX';
    const priceTypeToStore = job.data?.priceType ?? 'SPOT';

    // Outside market hours: only poll if last record is older than 15 minutes
    if (!inMarketHours && !isFixCapture) {
      const lastRecord = await prisma.lmePriceRecord.findFirst({
        orderBy: { recordedAt: 'desc' },
      });
      if (lastRecord) {
        const ageMs = now.getTime() - lastRecord.recordedAt.getTime();
        if (ageMs < OFF_HOURS_INTERVAL_SEC * 1000) {
          logger.debug('LME poller: outside market hours and price is recent — skipping fetch');
          return;
        }
      }
    }

    let priceUsd: number;
    let source: string;
    let timestamp: Date;

    const fetched = await fetchFromMetalsDev().catch((err) => {
      logger.error({ err }, 'LME poller: metals.dev fetch failed');
      return null;
    });

    if (fetched) {
      priceUsd = fetched.priceUsd;
      source = 'METALS_DEV';
      timestamp = fetched.timestamp;
    } else {
      // Fallback: read last known price from DB
      const last = await prisma.lmePriceRecord.findFirst({ orderBy: { recordedAt: 'desc' } });
      if (!last) {
        logger.warn('LME poller: no price data available — using hardcoded fallback');
        priceUsd = 2_350;
        source = 'FALLBACK';
        timestamp = now;
      } else {
        priceUsd = Number(last.priceUsdPerTroyOz);
        source = last.source;
        timestamp = last.recordedAt;
        // Mark as stale — don't re-save to DB
        const staleData = {
          priceUsdPerTroyOz: priceUsd,
          source,
          priceType: last.priceType,
          recordedAt: timestamp.toISOString(),
          cachedAt: now.toISOString(),
          stale: true,
        };
        connection
          .set(LME_CACHE_KEY, JSON.stringify(staleData), 'EX', LME_CACHE_TTL_SEC)
          .catch(() => {});
        return;
      }
    }

    // Save to DB (only fresh prices)
    try {
      await prisma.lmePriceRecord.create({
        data: {
          priceUsdPerTroyOz: priceUsd,
          priceType: priceTypeToStore,
          source,
          recordedAt: timestamp,
        },
      });
    } catch {
      // Unique constraint on [recordedAt, priceType] — skip duplicate
    }

    // Update Redis cache (always with latest SPOT price for feed consumers)
    if (!isFixCapture) {
      const cacheData = {
        priceUsdPerTroyOz: priceUsd,
        source,
        priceType: priceTypeToStore,
        recordedAt: timestamp.toISOString(),
        cachedAt: now.toISOString(),
        stale: false,
      };
      await connection
        .set(LME_CACHE_KEY, JSON.stringify(cacheData), 'EX', LME_CACHE_TTL_SEC)
        .catch((err) => logger.warn({ err }, 'Failed to update LME Redis cache'));

      // Publish to pub/sub for WebSocket broadcast
      connection.publish(LME_PUBSUB_CHANNEL, JSON.stringify(cacheData)).catch(() => {});
    }

    logger.info(
      { priceUsd, source, priceType: priceTypeToStore, inMarketHours, isFixCapture },
      'LME price polled and stored',
    );

    // Alert checks only on SPOT polls (not fix captures, to avoid duplicate alerts)
    if (!isFixCapture) {
      await runAlertChecks(priceUsd, connection, emailQueue);
    }
  };
}

// Market-hours-aware cron: every minute — processor handles off-hours throttling
export const LME_POLL_CRON = '* * * * *';
