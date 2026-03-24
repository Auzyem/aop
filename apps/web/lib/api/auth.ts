import { apiClient } from './client';
import type { AuthUser } from '../types';

export async function login(email: string, password: string) {
  const res = await apiClient.post('/auth/login', { email, password });
  return res.data.data as { accessToken?: string; requiresTOTP?: boolean; user?: AuthUser };
}

export async function loginWithTOTP(email: string, password: string, totpCode: string) {
  const res = await apiClient.post('/auth/login', { email, password, totpCode });
  return res.data.data as { accessToken: string; user: AuthUser };
}

export async function logout() {
  await apiClient.post('/auth/logout').catch(() => {});
}

export async function setupTotp() {
  const res = await apiClient.post('/auth/totp/setup');
  return res.data.data as { qrCodeUrl: string; secret: string };
}

export async function verifyTotp(code: string) {
  const res = await apiClient.post('/auth/totp/verify', { code });
  return res.data.data as { success: boolean };
}

export async function requestPasswordReset(email: string) {
  const res = await apiClient.post('/auth/password-reset/request', { email });
  return res.data;
}

export async function resetPassword(token: string, password: string) {
  const res = await apiClient.post('/auth/password-reset/confirm', { token, password });
  return res.data;
}

export async function getMe() {
  const res = await apiClient.get('/auth/me');
  return res.data.data as AuthUser;
}
