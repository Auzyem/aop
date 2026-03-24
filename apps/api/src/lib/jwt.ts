import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { AuthenticatedUser, JwtPayload } from '@aop/types';
import { UnauthorizedError } from '@aop/utils';

const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET ?? 'dev-access-secret';
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? 'dev-refresh-secret';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';
const TEMP_TTL = '5m';

export function signAccessToken(user: AuthenticatedUser): string {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    agentId: user.agentId,
    type: 'access',
  };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = randomUUID();
  const payload = { sub: userId, jti, type: 'refresh' };
  const token = jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  return { token, jti };
}

export function signTempToken(userId: string): string {
  const payload = { sub: userId, type: 'temp_2fa' };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: TEMP_TTL });
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): { sub: string; jti: string } {
  try {
    const payload = jwt.verify(token, REFRESH_SECRET) as JwtPayload;
    if (payload.type !== 'refresh' || !payload.jti) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    return { sub: payload.sub, jti: payload.jti };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

export function verifyTempToken(token: string): { sub: string } {
  try {
    const payload = jwt.verify(token, ACCESS_SECRET) as JwtPayload;
    if (payload.type !== 'temp_2fa') {
      throw new UnauthorizedError('Invalid temporary token');
    }
    return { sub: payload.sub };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired temporary token');
  }
}
