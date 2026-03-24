'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listDocuments,
  getChecklist,
  uploadDocument,
  getDownloadUrl,
  approveDocument,
  rejectDocument,
  downloadAllDocuments,
} from '../api/documents';

export function useDocuments(txnId: string | null) {
  return useQuery({
    queryKey: ['documents', txnId],
    queryFn: () => listDocuments(txnId!),
    enabled: !!txnId,
    staleTime: 30_000,
  });
}

export function useChecklist(txnId: string | null) {
  return useQuery({
    queryKey: ['checklist', txnId],
    queryFn: () => getChecklist(txnId!),
    enabled: !!txnId,
    staleTime: 30_000,
  });
}

export function useUploadDocument(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentType, file }: { documentType: string; file: File }) =>
      uploadDocument(txnId, documentType, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', txnId] });
      qc.invalidateQueries({ queryKey: ['checklist', txnId] });
    },
  });
}

export function useDocumentDownloadUrl() {
  return useMutation({ mutationFn: (docId: string) => getDownloadUrl(docId) });
}

export function useApproveDocument(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, reason }: { docId: string; reason?: string }) =>
      approveDocument(docId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', txnId] });
      qc.invalidateQueries({ queryKey: ['checklist', txnId] });
    },
  });
}

export function useRejectDocument(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, reason }: { docId: string; reason: string }) =>
      rejectDocument(docId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', txnId] });
      qc.invalidateQueries({ queryKey: ['checklist', txnId] });
    },
  });
}

export function useDownloadAllDocuments() {
  return useMutation({ mutationFn: (txnId: string) => downloadAllDocuments(txnId) });
}
