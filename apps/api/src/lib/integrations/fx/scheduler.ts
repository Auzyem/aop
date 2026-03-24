import { Queue, Worker } from 'bullmq';
import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { redis } from '../../redis.js';
import { getFxRateProvider } from './factory.js';

// ---------------------------------------------------------------------------
// BullMQ FX Rate Scheduler
// Registers a repeatable job that fires daily at 09:00 UTC.
// The Worker fetches rates, writes them to Redis (TTL 25h) and persists to DB.
// ---------------------------------------------------------------------------

const QUEUE_NAME = 'fx-rate-fetch';
const JOB_NAME = 'fetch-daily-rates';
const FX_CACHE_TTL_SEC = 25 * 60 * 60; // 25 hours

let fxQueue: Queue | null = null;
let fxWorker: Worker | null = null;

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

async function processFxJob() {
  const provider = getFxRateProvider();
  const date = new Date().toISOString().split('T')[0];

  logger.info({ date }, 'FX rate fetch job started');

  const data = await provider.getRates(date);

  // 1. Write to Redis
  const cacheKey = `fx:rates:${date}`;
  await redis.set(cacheKey, JSON.stringify(data), 'EX', FX_CACHE_TTL_SEC);

  // 2. Persist to DB (upsert each currency)
  const entries = Object.entries(data.rates);
  await Promise.all(
    entries.map(([currency, rate]) =>
      prisma.fxRate.upsert({
        where: { date_currency: { date, currency } },
        update: { rateToUsd: rate, fetchedAt: new Date() },
        create: { date, currency, rateToUsd: rate },
      }),
    ),
  );

  logger.info({ date, currencies: entries.length }, 'FX rate fetch job complete');
}

// ---------------------------------------------------------------------------
// Initialise queue + repeatable job + worker
// Called once at API startup.
// ---------------------------------------------------------------------------

export function initFxRateScheduler() {
  if (process.env.NODE_ENV === 'test') return; // skip in tests

  // BullMQ accepts a connection options object or ioredis instance (cast needed for type compat)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = redis as any;

  fxQueue = new Queue(QUEUE_NAME, { connection });

  // Schedule repeatable job: daily at 09:00 UTC
  fxQueue
    .add(
      JOB_NAME,
      {},
      {
        repeat: { pattern: '0 9 * * *' },
        jobId: 'fx-daily',
      },
    )
    .catch((err) => {
      logger.error({ err }, 'Failed to register FX repeatable job');
    });

  fxWorker = new Worker(
    QUEUE_NAME,
    async () => {
      await processFxJob();
    },
    { connection },
  );

  fxWorker.on('completed', () => {
    logger.info('FX rate fetch job completed successfully');
  });

  fxWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'FX rate fetch job failed');
  });

  logger.info('FX rate scheduler initialised — daily at 09:00 UTC');
}

export async function shutdownFxRateScheduler() {
  await fxWorker?.close();
  await fxQueue?.close();
}

/** Manually trigger a fetch (useful for admin endpoints / seeding) */
export async function triggerFxFetchNow() {
  await processFxJob();
}
