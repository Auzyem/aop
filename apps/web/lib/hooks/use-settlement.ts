'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSettlement,
  calculateSettlement,
  confirmSettlement,
  clearDiscrepancyFlag,
  downloadSettlementStatement,
  generateRemittanceInstruction,
  updateRemittanceStatus,
  type RemittanceStatus,
} from '../api/settlement';

export function useSettlement(txnId: string | null) {
  return useQuery({
    queryKey: ['settlement', txnId],
    queryFn: () => getSettlement(txnId!),
    enabled: !!txnId,
    staleTime: 30_000,
  });
}

export function useCalculateSettlement(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (currency?: string) => calculateSettlement(txnId, currency),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlement', txnId] }),
  });
}

export function useConfirmSettlement(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => confirmSettlement(txnId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlement', txnId] });
      qc.invalidateQueries({ queryKey: ['transaction', txnId] });
    },
  });
}

export function useClearDiscrepancyFlag(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => clearDiscrepancyFlag(txnId, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlement', txnId] });
      qc.invalidateQueries({ queryKey: ['transaction', txnId] });
    },
  });
}

export function useDownloadSettlementStatement() {
  return useMutation({ mutationFn: (txnId: string) => downloadSettlementStatement(txnId) });
}

export function useGenerateRemittanceInstruction(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => generateRemittanceInstruction(txnId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlement', txnId] }),
  });
}

export function useUpdateRemittanceStatus(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: RemittanceStatus) => updateRemittanceStatus(txnId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlement', txnId] }),
  });
}
