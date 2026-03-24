import Redis from 'ioredis';
import { logger } from '@aop/utils';

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export const redis: Redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

redis.on('error', (err) => {
  logger.error({ err }, 'Redis client error');
});

const RT_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function key(userId: string, jti: string): string {
  return `rt:${userId}:${jti}`;
}

export async function setRefreshToken(
  userId: string,
  jti: string,
  ttlSec: number = RT_TTL_SEC,
): Promise<void> {
  await redis.set(key(userId, jti), '1', 'EX', ttlSec);
}

export async function hasRefreshToken(userId: string, jti: string): Promise<boolean> {
  const val = await redis.get(key(userId, jti));
  return val !== null;
}

export async function deleteRefreshToken(userId: string, jti: string): Promise<void> {
  await redis.del(key(userId, jti));
}

export async function deleteAllUserTokens(userId: string): Promise<void> {
  const pattern = `rt:${userId}:*`;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}
