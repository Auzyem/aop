/**
 * User and authentication-related types.
 */

import type { ID, ISO8601 } from './common.js';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'COMPLIANCE_OFFICER'
  | 'TRADE_MANAGER'
  | 'OPERATIONS'
  | 'VIEWER';

export interface User {
  id: ID;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface JwtPayload {
  sub: ID;
  email: string;
  role: UserRole;
  agentId?: string;
  jti?: string;
  type?: 'access' | 'refresh' | 'temp_2fa';
  iat: number;
  exp: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  agentId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'createdAt' | 'updatedAt'>;
}
