import 'dotenv/config';
import http from 'http';
import { Redis } from 'ioredis';
import { Worker, Queue } from 'bullmq';
import { logger } from '@aop/utils';
import { createQueues, QUEUE_NAMES, type QueueName } from './queues/index.js';
import { kycRenewalProcessor } from './jobs/kyc-renewal.js';
import { createLmePollerProcessor, LME_POLL_CRON } from './jobs/lme-poller.js';
import { agentScoringProcessor, AGENT_SCORING_CRON } from './jobs/agent-scoring.js';
import {
  reportGenerationProcessor,
  scheduleMonthlyTar,
  scheduleWeeklyPortfolio,
} from './jobs/report-scheduler.js';
import { emailProcessor } from './jobs/email.processor.js';
import { backupVerifyProcessor, BACKUP_VERIFY_CRON } from './jobs/backup-verify.js';
import { retentionReviewProcessor, RETENTION_REVIEW_CRON } from './jobs/retention-review.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
});

connection.on('connect', () => logger.info('Worker connected to Redis'));
connection.on('error', (err) => logger.error({ err }, 'Redis connection error'));

// Initialise queues (they can be used to enqueue jobs from this process if needed)
const queues = createQueues(connection);

// ---------------------------------------------------------------------------
// Workers — one Worker per queue
// ---------------------------------------------------------------------------

const workers: Worker[] = [];

function createDefaultWorker(queueName: string): Worker {
  const worker = new Worker(
    queueName,
    async (job) => {
      logger.info({ queue: queueName, jobId: job.id, jobName: job.name }, 'Processing job');
      // TODO: dispatch to dedicated processor modules
    },
    { connection, concurrency: WORKER_CONCURRENCY },
  );

  worker.on('completed', (job) => {
    logger.info({ queue: queueName, jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ queue: queueName, jobId: job?.id, err }, 'Job failed');
  });

  return worker;
}

// Default workers for queues without dedicated processors yet
const dedicatedQueues = new Set<QueueName>([
  QUEUE_NAMES.KYC_RENEWAL_REMINDER,
  QUEUE_NAMES.LME_PRICE_POLL,
  QUEUE_NAMES.AGENT_SCORING,
  QUEUE_NAMES.REPORT_GENERATION,
  QUEUE_NAMES.EMAIL_NOTIFICATION,
  QUEUE_NAMES.BACKUP_VERIFY,
  QUEUE_NAMES.RETENTION_REVIEW,
]);
const defaultQueues = Object.values(QUEUE_NAMES).filter((name) => !dedicatedQueues.has(name));
for (const name of defaultQueues) {
  workers.push(createDefaultWorker(name));
}

// ---------------------------------------------------------------------------
// KYC renewal reminder — dedicated processor + daily cron
// ---------------------------------------------------------------------------

const kycRenewalWorker = new Worker(QUEUE_NAMES.KYC_RENEWAL_REMINDER, kycRenewalProcessor, {
  connection,
  concurrency: 1,
});

kycRenewalWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'KYC renewal job completed');
});
kycRenewalWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'KYC renewal job failed');
});

workers.push(kycRenewalWorker);

// ---------------------------------------------------------------------------
// Email notifications — dedicated processor
// ---------------------------------------------------------------------------

const emailWorker = new Worker(QUEUE_NAMES.EMAIL_NOTIFICATION, emailProcessor, {
  connection,
  concurrency: WORKER_CONCURRENCY,
});

emailWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, jobName: job.name }, 'Email job completed');
});
emailWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Email job failed');
});

workers.push(emailWorker);

// ---------------------------------------------------------------------------
// LME price poller — dedicated processor + per-minute cron
// ---------------------------------------------------------------------------

const emailQueue = queues[QUEUE_NAMES.EMAIL_NOTIFICATION];

const lmePollerWorker = new Worker(
  QUEUE_NAMES.LME_PRICE_POLL,
  createLmePollerProcessor(connection, emailQueue),
  { connection, concurrency: 1 },
);

lmePollerWorker.on('completed', (job) => logger.debug({ jobId: job.id }, 'LME poll job completed'));
lmePollerWorker.on('failed', (job, err) =>
  logger.error({ jobId: job?.id, err }, 'LME poll job failed'),
);

workers.push(lmePollerWorker);

const lmePollQueue = queues[QUEUE_NAMES.LME_PRICE_POLL] as Queue;
lmePollQueue
  .add('poll', {}, { repeat: { pattern: LME_POLL_CRON }, removeOnComplete: 5, removeOnFail: 3 })
  .then(() => logger.info('LME SPOT price poll cron scheduled (every minute)'))
  .catch((err) => logger.error({ err }, 'Failed to schedule LME poll cron'));

// AM Fix capture — 10:30 UTC Mon–Fri (matches LBMA AM Fix in GMT; 1h offset in BST)
lmePollQueue
  .add(
    'am-fix',
    { priceType: 'AM_FIX' },
    { repeat: { pattern: '30 10 * * 1-5' }, removeOnComplete: 5, removeOnFail: 3 },
  )
  .then(() => logger.info('LME AM Fix capture cron scheduled (10:30 UTC Mon–Fri)'))
  .catch((err) => logger.error({ err }, 'Failed to schedule AM Fix cron'));

// PM Fix capture — 15:00 UTC Mon–Fri (matches LBMA PM Fix in GMT; 1h offset in BST)
lmePollQueue
  .add(
    'pm-fix',
    { priceType: 'PM_FIX' },
    { repeat: { pattern: '0 15 * * 1-5' }, removeOnComplete: 5, removeOnFail: 3 },
  )
  .then(() => logger.info('LME PM Fix capture cron scheduled (15:00 UTC Mon–Fri)'))
  .catch((err) => logger.error({ err }, 'Failed to schedule PM Fix cron'));

// Schedule daily cron job (idempotent — BullMQ deduplicates by jobId)
const kycRenewalQueue = queues[QUEUE_NAMES.KYC_RENEWAL_REMINDER] as Queue;
kycRenewalQueue
  .add(
    'daily-check',
    {},
    {
      repeat: { pattern: '0 0 * * *' }, // midnight UTC daily
      removeOnComplete: 10,
      removeOnFail: 5,
    },
  )
  .then(() => logger.info('KYC renewal reminder cron job scheduled'))
  .catch((err) => logger.error({ err }, 'Failed to schedule KYC renewal cron'));

// ---------------------------------------------------------------------------
// Agent scoring — dedicated processor + daily cron at 01:00 UTC
// ---------------------------------------------------------------------------

const agentScoringWorker = new Worker(QUEUE_NAMES.AGENT_SCORING, agentScoringProcessor, {
  connection,
  concurrency: 1,
});

agentScoringWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Agent scoring job completed');
});
agentScoringWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Agent scoring job failed');
});

workers.push(agentScoringWorker);

const agentScoringQueue = queues[QUEUE_NAMES.AGENT_SCORING] as Queue;
agentScoringQueue
  .add(
    'daily-scoring',
    {},
    {
      repeat: { pattern: AGENT_SCORING_CRON },
      removeOnComplete: 10,
      removeOnFail: 5,
    },
  )
  .then(() => logger.info('Agent scoring cron job scheduled'))
  .catch((err) => logger.error({ err }, 'Failed to schedule agent scoring cron'));

// ---------------------------------------------------------------------------
// Report generation — dedicated processor + monthly TAR + weekly portfolio crons
// ---------------------------------------------------------------------------

const reportGenerationWorker = new Worker(
  QUEUE_NAMES.REPORT_GENERATION,
  reportGenerationProcessor,
  { connection, concurrency: 2 },
);

reportGenerationWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Report generation job completed');
});
reportGenerationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Report generation job failed');
});

workers.push(reportGenerationWorker);

const reportGenerationQueue = queues[QUEUE_NAMES.REPORT_GENERATION] as Queue;
scheduleMonthlyTar(reportGenerationQueue)
  .then(() => logger.info('Monthly TAR cron scheduled'))
  .catch((err) => logger.error({ err }, 'Failed to schedule monthly TAR cron'));

scheduleWeeklyPortfolio(reportGenerationQueue)
  .then(() => logger.info('Weekly portfolio summary cron scheduled'))
  .catch((err) => logger.error({ err }, 'Failed to schedule weekly portfolio cron'));

// ---------------------------------------------------------------------------
// Backup verification — dedicated processor + weekly cron (Saturdays 06:00 UTC)
// ---------------------------------------------------------------------------

const backupVerifyWorker = new Worker(QUEUE_NAMES.BACKUP_VERIFY, backupVerifyProcessor, {
  connection,
  concurrency: 1,
});

backupVerifyWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Backup verification job completed');
});
backupVerifyWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Backup verification job failed');
});

workers.push(backupVerifyWorker);

const backupVerifyQueue = queues[QUEUE_NAMES.BACKUP_VERIFY] as Queue;
backupVerifyQueue
  .add(
    'weekly-verify',
    {},
    {
      repeat: { pattern: BACKUP_VERIFY_CRON },
      removeOnComplete: 10,
      removeOnFail: 10,
    },
  )
  .then(() => logger.info('Backup verification cron scheduled (Saturdays 06:00 UTC)'))
  .catch((err) => logger.error({ err }, 'Failed to schedule backup verify cron'));

// ---------------------------------------------------------------------------
// Annual retention review — dedicated processor + Jan 1 cron
// ---------------------------------------------------------------------------

const retentionReviewWorker = new Worker(QUEUE_NAMES.RETENTION_REVIEW, retentionReviewProcessor, {
  connection,
  concurrency: 1,
});

retentionReviewWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Retention review job completed');
});
retentionReviewWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Retention review job failed');
});

workers.push(retentionReviewWorker);

const retentionReviewQueue = queues[QUEUE_NAMES.RETENTION_REVIEW] as Queue;
retentionReviewQueue
  .add(
    'annual-review',
    {},
    {
      repeat: { pattern: RETENTION_REVIEW_CRON },
      removeOnComplete: 5,
      removeOnFail: 5,
    },
  )
  .then(() => logger.info('Annual retention review cron scheduled (Jan 1 07:00 UTC)'))
  .catch((err) => logger.error({ err }, 'Failed to schedule retention review cron'));

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

logger.info({ queues: Object.values(QUEUE_NAMES) }, 'AOP Worker started');

// ---------------------------------------------------------------------------
// Minimal health-check HTTP server (ALB requires a responding endpoint)
// ---------------------------------------------------------------------------

const HEALTH_PORT = Number(process.env.PORT ?? 5000);
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(HEALTH_PORT, () => {
  logger.info({ port: HEALTH_PORT }, 'Worker health server listening');
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received, draining workers...');
  healthServer.close();
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  logger.info('Worker shut down cleanly');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
