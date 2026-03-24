import { apiClient } from './client';

export interface RegulatoryReport {
  id: string;
  reportType: string;
  status: 'GENERATING' | 'READY' | 'FAILED' | 'SUBMITTED';
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
  generatedAt: string;
  filePath?: string;
  storageKey?: string;
  submittedAt?: string;
  notes?: string;
}

export interface ReportScheduleItem {
  reportType: string;
  cronExpression: string;
  recipients: string[];
  enabled: boolean;
}

export async function listReports() {
  const res = await apiClient.get('/reports');
  return res.data.data as RegulatoryReport[];
}

export async function generateReport(data: {
  reportType: string;
  periodStart?: string;
  periodEnd?: string;
  transactionId?: string;
  notes?: string;
}) {
  const res = await apiClient.post('/reports/generate', data);
  return res.data.data as RegulatoryReport;
}

export async function getReport(id: string) {
  const res = await apiClient.get(`/reports/${id}`);
  return res.data.data as RegulatoryReport;
}

export async function downloadReport(id: string) {
  const res = await apiClient.get(`/reports/${id}/download`);
  return res.data.data as { url: string };
}

export async function submitReport(id: string) {
  const res = await apiClient.post(`/reports/${id}/submit`);
  return res.data.data as RegulatoryReport;
}

export async function getSuspiciousTransactions() {
  const res = await apiClient.get('/reports/suspicious-transactions');
  return res.data.data;
}

export async function generateStrDraft(transactionId: string) {
  const res = await apiClient.post(`/reports/str-draft/${transactionId}`);
  return res.data.data as RegulatoryReport;
}

export async function getReportSchedule() {
  const res = await apiClient.get('/reports/schedule');
  return res.data.data as ReportScheduleItem[];
}

export async function updateReportSchedule(data: ReportScheduleItem) {
  const res = await apiClient.put('/reports/schedule', data);
  return res.data.data as ReportScheduleItem[];
}
