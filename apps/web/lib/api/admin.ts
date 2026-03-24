import { apiClient } from './client';
import type { AuthUser } from '../types';

export interface AdminUser extends AuthUser {
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
  totpEnabled: boolean;
}

export interface Agent {
  id: string;
  companyName: string;
  contactEmail: string;
  contactPhone?: string;
  countryCode: string;
  isActive: boolean;
  commissionRate?: number;
  docAccuracyScore?: number;
  performanceScore?: number;
  createdAt: string;
}

export interface SystemSetting {
  key: string;
  value: unknown;
  updatedBy?: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
  user?: { email: string };
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(params?: Record<string, unknown>) {
  const res = await apiClient.get('/admin/users', { params });
  return res.data.data as AdminUser[];
}

export async function getUser(id: string) {
  const res = await apiClient.get(`/admin/users/${id}`);
  return res.data.data as AdminUser;
}

export async function createUser(data: {
  email: string;
  password: string;
  role: string;
  countryCode?: string;
}) {
  const res = await apiClient.post('/admin/users', data);
  return res.data.data as AdminUser;
}

export async function updateUser(id: string, data: Partial<AdminUser>) {
  const res = await apiClient.patch(`/admin/users/${id}`, data);
  return res.data.data as AdminUser;
}

export async function deactivateUser(id: string) {
  const res = await apiClient.post(`/admin/users/${id}/deactivate`);
  return res.data.data as AdminUser;
}

export async function resetUserTotp(id: string) {
  const res = await apiClient.post(`/admin/users/${id}/reset-totp`);
  return res.data.data;
}

// ── Agents ───────────────────────────────────────────────────────────────────

export async function listAgents(params?: Record<string, unknown>) {
  const res = await apiClient.get('/admin/agents', { params });
  return res.data.data as Agent[];
}

export async function getAgent(id: string) {
  const res = await apiClient.get(`/admin/agents/${id}`);
  return res.data.data as Agent;
}

export async function createAgent(data: Partial<Agent>) {
  const res = await apiClient.post('/admin/agents', data);
  return res.data.data as Agent;
}

export async function updateAgent(id: string, data: Partial<Agent>) {
  const res = await apiClient.patch(`/admin/agents/${id}`, data);
  return res.data.data as Agent;
}

export async function deactivateAgent(id: string) {
  const res = await apiClient.post(`/admin/agents/${id}/deactivate`);
  return res.data.data as Agent;
}

export async function getAgentTransactions(id: string) {
  const res = await apiClient.get(`/admin/agents/${id}/transactions`);
  return res.data.data;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  const res = await apiClient.get('/admin/settings');
  return res.data.data as SystemSetting[];
}

export async function updateSetting(key: string, value: unknown) {
  const res = await apiClient.put(`/admin/settings/${key}`, { value });
  return res.data.data as SystemSetting;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export async function getAuditLog(params?: Record<string, unknown>) {
  const res = await apiClient.get('/admin/audit', { params });
  return res.data.data as AuditEvent[];
}

export async function exportAuditCsv(params?: Record<string, unknown>) {
  const res = await apiClient.get('/admin/audit/export', { params, responseType: 'blob' });
  return res.data as Blob;
}
