'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deactivateUser,
  resetUserTotp,
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deactivateAgent,
  getAgentTransactions,
  getSettings,
  updateSetting,
  getAuditLog,
  exportAuditCsv,
  type AdminUser,
  type Agent,
} from '../api/admin';

// ── Users ────────────────────────────────────────────────────────────────────

export function useUsers(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => listUsers(params),
    staleTime: 30_000,
  });
}

export function useAdminUser(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => getUser(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AdminUser>) => updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useResetUserTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resetUserTotp(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// ── Agents ───────────────────────────────────────────────────────────────────

export function useAgents(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['admin', 'agents', params],
    queryFn: () => listAgents(params),
    staleTime: 30_000,
  });
}

export function useAdminAgent(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'agent', id],
    queryFn: () => getAgent(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAgent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'agents'] }),
  });
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Agent>) => updateAgent(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'agents'] });
      qc.invalidateQueries({ queryKey: ['admin', 'agent', id] });
    },
  });
}

export function useDeactivateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateAgent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'agents'] }),
  });
}

export function useAgentTransactions(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'agent', id, 'transactions'],
    queryFn: () => getAgentTransactions(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function useSettings() {
  return useQuery({ queryKey: ['admin', 'settings'], queryFn: getSettings, staleTime: 60_000 });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => updateSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export function useAuditLog(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => getAuditLog(params),
    staleTime: 30_000,
  });
}

export function useExportAuditCsv() {
  return useMutation({ mutationFn: (params?: Record<string, unknown>) => exportAuditCsv(params) });
}
