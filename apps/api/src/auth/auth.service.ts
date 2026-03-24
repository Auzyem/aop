import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { prisma } from '@aop/db';
import { UnauthorizedError } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import {
  signAccessToken,
  signRefreshToken,
  signTempToken,
  verifyRefreshToken,
  verifyTempToken,
} from '../lib/jwt.js';
import { setRefreshToken, hasRefreshToken, deleteRefreshToken, redis } from '../lib/redis.js';

// ---------------------------------------------------------------------------
// Account lockout — 5 failed attempts → 15-minute lock
// Redis key: auth:lockout:{email}  value: attempt count  TTL: 15 min
// ---------------------------------------------------------------------------

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_TTL_SEC = 15 * 60; // 15 minutes

function lockoutKey(email: string): string {
  return `auth:lockout:${email.toLowerCase()}`;
}

async function checkLockout(email: string): Promise<void> {
  const count = await redis.get(lockoutKey(email));
  if (count !== null && parseInt(count, 10) >= LOCKOUT_MAX_ATTEMPTS) {
    throw new UnauthorizedError(
      'Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
    );
  }
}

async function recordFailedAttempt(email: string): Promise<void> {
  const key = lockoutKey(email);
  const count = await redis.incr(key);
  if (count === 1) {
    // First failure — initialise TTL
    await redis.expire(key, LOCKOUT_TTL_SEC);
  }
}

async function clearLockout(email: string): Promise<void> {
  await redis.del(lockoutKey(email));
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

const RT_TTL_SEC = 7 * 24 * 60 * 60;

async function createTokenPair(user: AuthenticatedUser): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, jti } = signRefreshToken(user.id);
  await setRefreshToken(user.id, jti, RT_TTL_SEC);
  return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<
  | { requiresTOTP: true; tempToken: string }
  | { requiresTOTP: false; accessToken: string; refreshToken: string; user: AuthenticatedUser }
> {
  // Check lockout BEFORE hitting the DB (avoids user enumeration timing attacks)
  await checkLockout(email);

  const dbUser = await prisma.user.findUnique({ where: { email } });

  // Always run bcrypt compare to prevent timing attacks (even if user not found)
  const dummyHash = '$2a$12$invalidhashpaddingtomakethisconstanttimexyz';
  const hashToCheck = dbUser?.passwordHash ?? dummyHash;
  const valid = await bcrypt.compare(password, hashToCheck);

  if (!dbUser || !valid) {
    await recordFailedAttempt(email);
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!dbUser.isActive) {
    throw new UnauthorizedError('Account is disabled');
  }

  // Successful login — clear any lockout counter
  await clearLockout(email);

  if (dbUser.twoFactorSecret) {
    const tempToken = signTempToken(dbUser.id);
    return { requiresTOTP: true, tempToken };
  }

  const user: AuthenticatedUser = {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    agentId: dbUser.agentId ?? undefined,
  };
  const tokens = await createTokenPair(user);
  return { requiresTOTP: false, ...tokens, user };
}

// ---------------------------------------------------------------------------
// TOTP verification
// ---------------------------------------------------------------------------

export async function verifyTotp(
  tempToken: string,
  code: string,
): Promise<{ accessToken: string; refreshToken: string; user: AuthenticatedUser }> {
  const { sub: userId } = verifyTempToken(tempToken);

  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser || !dbUser.twoFactorSecret) {
    throw new UnauthorizedError('Invalid session');
  }

  const valid = speakeasy.totp.verify({
    secret: dbUser.twoFactorSecret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
  if (!valid) throw new UnauthorizedError('Invalid TOTP code');

  const user: AuthenticatedUser = {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    agentId: dbUser.agentId ?? undefined,
  };
  const tokens = await createTokenPair(user);
  return { ...tokens, user };
}

// ---------------------------------------------------------------------------
// TOTP setup
// ---------------------------------------------------------------------------

export async function setupTotp(userId: string): Promise<{
  secret: string;
  qrCodeUri: string;
}> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser) throw new UnauthorizedError('User not found');

  const secret = speakeasy.generateSecret({ name: `AOP:${dbUser.email}`, length: 20 });
  return {
    secret: secret.base32 ?? '',
    qrCodeUri: secret.otpauth_url ?? '',
  };
}

// ---------------------------------------------------------------------------
// Refresh token rotation — old token is deleted, new one issued
// ---------------------------------------------------------------------------

export async function refreshTokens(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { sub: userId, jti } = verifyRefreshToken(refreshToken);

  const exists = await hasRefreshToken(userId, jti);
  if (!exists) throw new UnauthorizedError('Refresh token has been revoked');

  // Invalidate old token immediately (rotation)
  await deleteRefreshToken(userId, jti);

  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser || !dbUser.isActive) throw new UnauthorizedError('User not found or inactive');

  const user: AuthenticatedUser = {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    agentId: dbUser.agentId ?? undefined,
  };
  return createTokenPair(user);
}

// ---------------------------------------------------------------------------
// Logout — revoke refresh token
// ---------------------------------------------------------------------------

export async function logout(refreshToken: string): Promise<void> {
  try {
    const { sub: userId, jti } = verifyRefreshToken(refreshToken);
    await deleteRefreshToken(userId, jti);
  } catch {
    // Ignore invalid token on logout — idempotent operation
  }
}
