'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  runSanctionsScreen,
  manualSanctionsRecord,
  getClientKyc,
  approveKyc,
  rejectKyc,
  getKycChecklist,
  updatePepEddFlags,
  getClientTransactions,
  getClientScreeningHistory,
  uploadKycDocument,
  approveKycDocument,
  rejectKycDocument,
} from '../api/clients';

export function useClients(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['clients', params],
    queryFn: () => listClients(params),
    staleTime: 30_000,
  });
}

export function useClient(id: string | null) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => getClient(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createClient,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => updateClient(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', id] }),
  });
}

export function useSanctionsScreen(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runSanctionsScreen(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['client', id, 'screenings'] });
    },
  });
}

export function useManualSanctionsScreen(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { outcome: 'CLEAR' | 'HIT' | 'POSSIBLE_MATCH'; note?: string }) =>
      manualSanctionsRecord(id, payload.outcome, payload.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['client', id, 'screenings'] });
    },
  });
}

export function useClientKyc(id: string | null) {
  return useQuery({
    queryKey: ['client', id, 'kyc'],
    queryFn: () => getClientKyc(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useApproveKyc(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => approveKyc(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', id] }),
  });
}

export function useRejectKyc(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => rejectKyc(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', id] }),
  });
}

export function useKycChecklist(id: string | null) {
  return useQuery({
    queryKey: ['client', id, 'kyc-checklist'],
    queryFn: () => getKycChecklist(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useUpdatePepEdd(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { isPEP?: boolean; isEDD?: boolean }) => updatePepEddFlags(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', id] }),
  });
}

export function useClientTransactions(id: string | null) {
  return useQuery({
    queryKey: ['client', id, 'transactions'],
    queryFn: () => getClientTransactions(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useClientScreeningHistory(id: string | null) {
  return useQuery({
    queryKey: ['client', id, 'screenings'],
    queryFn: () => getClientScreeningHistory(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useUploadKycDocument(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentType, file }: { documentType: string; file: File }) =>
      uploadKycDocument(clientId, documentType, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', clientId, 'kyc'] });
      qc.invalidateQueries({ queryKey: ['client', clientId, 'kyc-checklist'] });
    },
  });
}

export function useApproveKycDocument(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, reason }: { docId: string; reason?: string }) =>
      approveKycDocument(clientId, docId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', clientId, 'kyc'] }),
  });
}

export function useRejectKycDocument(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, reason }: { docId: string; reason: string }) =>
      rejectKycDocument(clientId, docId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', clientId, 'kyc'] }),
  });
}
