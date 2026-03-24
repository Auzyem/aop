'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTransactions,
  getTransaction,
  createTransaction,
  advancePhase,
  getTransactionEvents,
  addComment,
  getPhaseChecklist,
  getAlerts,
  dismissAlert,
  exportTransactionsCsv,
  listRefineries,
} from '../api/transactions';

export function useTransactions(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => listTransactions(params),
    staleTime: 30_000,
  });
}

export function useTransaction(id: string | null) {
  return useQuery({
    queryKey: ['transaction', id],
    queryFn: () => getTransaction(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

export function useAdvancePhase(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data?: unknown) => advancePhase(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transaction', id] }),
  });
}

export function useTransactionEvents(id: string) {
  return useQuery({
    queryKey: ['transaction', id, 'events'],
    queryFn: () => getTransactionEvents(id),
    staleTime: 10_000,
  });
}

export function useAddComment(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => addComment(txnId, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transaction', txnId, 'events'] }),
  });
}

export function usePhaseChecklist(txnId: string | null) {
  return useQuery({
    queryKey: ['transaction', txnId, 'phase-checklist'],
    queryFn: () => getPhaseChecklist(txnId!),
    enabled: !!txnId,
    staleTime: 30_000,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: getAlerts,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dismissAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useExportTransactionsCsv() {
  return useMutation({ mutationFn: exportTransactionsCsv });
}

export function useRefineries() {
  return useQuery({ queryKey: ['refineries'], queryFn: listRefineries, staleTime: 300_000 });
}
