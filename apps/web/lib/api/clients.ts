import { apiClient } from './client';

export interface ClientSummary {
  id: string;
  fullName: string;
  entityType: string;
  countryCode: string;
  kycStatus: string;
  sanctionsStatus: string;
  riskRating: string;
  assignedAgentId?: string;
  createdAt: string;
}

export interface PaginatedClients {
  data: { clients: ClientSummary[]; total: number; page: number; limit: number };
}

export async function listClients(params?: Record<string, unknown>) {
  const res = await apiClient.get('/clients', { params });
  return res.data as PaginatedClients;
}

export async function getClient(id: string) {
  const res = await apiClient.get(`/clients/${id}`);
  return res.data.data;
}

export async function createClient(data: unknown) {
  const res = await apiClient.post('/clients', data);
  return res.data.data;
}

export async function updateClient(id: string, data: unknown) {
  const res = await apiClient.patch(`/clients/${id}`, data);
  return res.data.data;
}

export async function runSanctionsScreen(id: string) {
  const res = await apiClient.post(`/clients/${id}/screening`);
  return res.data.data as {
    outcome: string;
    provider: string;
    screenedAt: string;
    hitCount?: number;
    rawResult?: unknown;
  };
}

export async function getClientKyc(id: string) {
  const res = await apiClient.get(`/clients/${id}/kyc`);
  return res.data.data;
}

export async function approveKyc(id: string) {
  const res = await apiClient.post(`/clients/${id}/kyc/approve`);
  return res.data.data;
}

export async function rejectKyc(id: string, reason: string) {
  const res = await apiClient.post(`/clients/${id}/kyc/reject`, { reason });
  return res.data.data;
}

export async function getKycChecklist(id: string) {
  const res = await apiClient.get(`/clients/${id}/kyc/checklist`);
  return res.data.data as Array<{
    item: string;
    status: 'COMPLETE' | 'PENDING' | 'BLOCKED';
    blocker?: string;
  }>;
}

export async function updatePepEddFlags(id: string, data: { isPEP?: boolean; isEDD?: boolean }) {
  const res = await apiClient.patch(`/clients/${id}/flags`, data);
  return res.data.data;
}

export async function getClientTransactions(id: string) {
  const res = await apiClient.get(`/clients/${id}/transactions`);
  return res.data.data;
}

export async function getClientScreeningHistory(id: string) {
  const res = await apiClient.get(`/clients/${id}/screenings`);
  return res.data.data as Array<{
    id: string;
    provider: string;
    outcome: string;
    hitCount?: number;
    screenedAt: string;
    rawResult?: unknown;
  }>;
}

export async function uploadKycDocument(clientId: string, documentType: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('documentType', documentType);
  const res = await apiClient.post(`/clients/${clientId}/kyc/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export async function approveKycDocument(clientId: string, docId: string, reason?: string) {
  const res = await apiClient.post(`/clients/${clientId}/kyc/documents/${docId}/approve`, {
    reason,
  });
  return res.data.data;
}

export async function rejectKycDocument(clientId: string, docId: string, reason: string) {
  const res = await apiClient.post(`/clients/${clientId}/kyc/documents/${docId}/reject`, {
    reason,
  });
  return res.data.data;
}
