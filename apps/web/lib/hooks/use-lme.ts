'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCurrentPrice,
  getPriceHistory,
  getDashboard,
  lockPrice,
  getPriceAlerts,
  generateValuationPdf,
  getTransactionsAwaitingLock,
  getRefineryPipeline,
  type PriceLockPayload,
} from '../api/lme';

export function useLMECurrentPrice() {
  return useQuery({
    queryKey: ['lme', 'current'],
    queryFn: getCurrentPrice,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useLMEHistory(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['lme', 'history', params],
    queryFn: () => getPriceHistory(params),
    staleTime: 30_000,
  });
}

export function useLMEDashboard() {
  return useQuery({ queryKey: ['lme', 'dashboard'], queryFn: getDashboard, staleTime: 30_000 });
}

export function usePriceAlerts() {
  return useQuery({
    queryKey: ['lme', 'alerts'],
    queryFn: getPriceAlerts,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useLockPrice(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PriceLockPayload) => lockPrice(txnId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction', txnId] });
      qc.invalidateQueries({ queryKey: ['lme', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['lme', 'awaiting-lock'] });
    },
  });
}

export function useGenerateValuationPdf() {
  return useMutation({ mutationFn: (txnId: string) => generateValuationPdf(txnId) });
}

export function useTransactionsAwaitingLock() {
  return useQuery({
    queryKey: ['lme', 'awaiting-lock'],
    queryFn: getTransactionsAwaitingLock,
    staleTime: 30_000,
  });
}

export function useRefineryPipeline() {
  return useQuery({
    queryKey: ['lme', 'refinery-pipeline'],
    queryFn: getRefineryPipeline,
    staleTime: 30_000,
  });
}
