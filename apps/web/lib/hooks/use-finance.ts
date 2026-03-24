'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCostItems,
  getDisbursements,
  getAgentBalance,
  approveCostEstimate,
  rejectCostEstimate,
  getCostApprovalStatus,
  getAgentDisbursements,
  requestDisbursement,
  uploadDisbursementReceipt,
  getAgentNextAction,
  getPortfolioSummary,
  getMonthlyPnl,
  getRevenueByCountry,
  getCostExposure,
  getUnreconciledBalances,
  listAllDisbursements,
  approveDisbursement,
  rejectDisbursement,
} from '../api/finance';

export function useCostItems(txnId: string | null) {
  return useQuery({
    queryKey: ['finance', 'costs', txnId],
    queryFn: () => getCostItems(txnId!),
    enabled: !!txnId,
    staleTime: 30_000,
  });
}

export function useDisbursements(txnId: string | null) {
  return useQuery({
    queryKey: ['finance', 'disbursements', txnId],
    queryFn: () => getDisbursements(txnId!),
    enabled: !!txnId,
    staleTime: 30_000,
  });
}

export function useAgentBalance(agentId: string | null) {
  return useQuery({
    queryKey: ['finance', 'agent-balance', agentId],
    queryFn: () => getAgentBalance(agentId!),
    enabled: !!agentId,
    staleTime: 60_000,
  });
}

export function useCostApprovalStatus(txnId: string | null) {
  return useQuery({
    queryKey: ['finance', 'cost-approval', txnId],
    queryFn: () => getCostApprovalStatus(txnId!),
    enabled: !!txnId,
    staleTime: 30_000,
  });
}

export function useApproveCostEstimate(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => approveCostEstimate(txnId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'cost-approval', txnId] }),
  });
}

export function useRejectCostEstimate(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => rejectCostEstimate(txnId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'cost-approval', txnId] }),
  });
}

export function useAgentDisbursements(agentId: string | null) {
  return useQuery({
    queryKey: ['finance', 'agent-disbursements', agentId],
    queryFn: () => getAgentDisbursements(agentId!),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useRequestDisbursement(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { trancheNo: number; amountUsd: number; note?: string }) =>
      requestDisbursement(txnId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'agent-disbursements'] }),
  });
}

export function useUploadDisbursementReceipt() {
  return useMutation({
    mutationFn: ({ disbursementId, file }: { disbursementId: string; file: File }) =>
      uploadDisbursementReceipt(disbursementId, file),
  });
}

export function useAgentNextAction(txnId: string | null) {
  return useQuery({
    queryKey: ['agent-action', txnId],
    queryFn: () => getAgentNextAction(txnId!),
    enabled: !!txnId,
    staleTime: 30_000,
  });
}

export function usePortfolioSummary(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['finance', 'portfolio-summary', params],
    queryFn: () => getPortfolioSummary(params),
    staleTime: 30_000,
  });
}

export function useMonthlyPnl() {
  return useQuery({
    queryKey: ['finance', 'monthly-pnl'],
    queryFn: getMonthlyPnl,
    staleTime: 60_000,
  });
}

export function useRevenueByCountry() {
  return useQuery({
    queryKey: ['finance', 'revenue-by-country'],
    queryFn: getRevenueByCountry,
    staleTime: 60_000,
  });
}

export function useCostExposure() {
  return useQuery({
    queryKey: ['finance', 'cost-exposure'],
    queryFn: getCostExposure,
    staleTime: 30_000,
  });
}

export function useUnreconciledBalances() {
  return useQuery({
    queryKey: ['finance', 'unreconciled-balances'],
    queryFn: getUnreconciledBalances,
    staleTime: 60_000,
  });
}

export function useAllDisbursements(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['finance', 'all-disbursements', params],
    queryFn: () => listAllDisbursements(params),
    staleTime: 30_000,
  });
}

export function useApproveDisbursement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (disbursementId: string) => approveDisbursement(disbursementId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'all-disbursements'] }),
  });
}

export function useRejectDisbursement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectDisbursement(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'all-disbursements'] }),
  });
}
