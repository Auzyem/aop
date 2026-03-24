import { apiClient } from './client';

export async function listTransactions(params?: Record<string, unknown>) {
  const res = await apiClient.get('/transactions', { params });
  return res.data;
}

export async function getTransaction(id: string) {
  const res = await apiClient.get(`/transactions/${id}`);
  return res.data.data;
}

export async function createTransaction(data: unknown) {
  const res = await apiClient.post('/transactions', data);
  return res.data.data;
}

export async function advancePhase(id: string, data?: unknown) {
  const res = await apiClient.post(`/transactions/${id}/advance`, data ?? {});
  return res.data.data;
}

export async function getTransactionEvents(id: string) {
  const res = await apiClient.get(`/transactions/${id}/events`);
  return res.data.data;
}

export async function addComment(id: string, message: string) {
  const res = await apiClient.post(`/transactions/${id}/events`, { type: 'COMMENT', message });
  return res.data.data;
}

export async function getPhaseChecklist(id: string) {
  const res = await apiClient.get(`/transactions/${id}/phase-checklist`);
  return res.data.data as Array<{
    item: string;
    status: 'COMPLETE' | 'PENDING' | 'BLOCKED';
    blocker?: string;
  }>;
}

export async function getAlerts() {
  const res = await apiClient.get('/transactions/alerts');
  return res.data.data as Array<{
    id: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    type: 'PRICE_ALERT' | 'SLA_BREACH' | 'UNRECONCILED_DISBURSEMENT' | 'GENERAL';
    description: string;
    txnId?: string;
    createdAt: string;
  }>;
}

export async function dismissAlert(alertId: string) {
  const res = await apiClient.post(`/transactions/alerts/${alertId}/dismiss`);
  return res.data.data;
}

export async function exportTransactionsCsv(params?: Record<string, unknown>): Promise<Blob> {
  const res = await apiClient.get('/transactions/export', { params, responseType: 'blob' });
  return res.data;
}

export async function listRefineries() {
  const res = await apiClient.get('/admin/refineries');
  return res.data.data as Array<{
    id: string;
    name: string;
    countryCode: string;
    isActive: boolean;
  }>;
}
