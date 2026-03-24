'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listReports,
  getReport,
  generateReport,
  submitReport,
  downloadReport,
  getSuspiciousTransactions,
  generateStrDraft,
  getReportSchedule,
  updateReportSchedule,
  type ReportScheduleItem,
} from '../api/reporting';

export function useReports() {
  return useQuery({ queryKey: ['reports'], queryFn: listReports, staleTime: 30_000 });
}

export function useReport(id: string | null) {
  return useQuery({
    queryKey: ['report', id],
    queryFn: () => getReport(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: generateReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

export function useSubmitReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

export function useDownloadReport() {
  return useMutation({ mutationFn: (id: string) => downloadReport(id) });
}

export function useSuspiciousTransactions() {
  return useQuery({
    queryKey: ['reports', 'suspicious'],
    queryFn: getSuspiciousTransactions,
    staleTime: 60_000,
  });
}

export function useGenerateStrDraft(txnId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => generateStrDraft(txnId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

export function useReportSchedule() {
  return useQuery({
    queryKey: ['reports', 'schedule'],
    queryFn: getReportSchedule,
    staleTime: 60_000,
  });
}

export function useUpdateReportSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReportScheduleItem) => updateReportSchedule(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports', 'schedule'] }),
  });
}
