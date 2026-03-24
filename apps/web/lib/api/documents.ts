import { apiClient } from './client';

export async function listDocuments(txnId: string) {
  const res = await apiClient.get(`/documents/transaction/${txnId}`);
  return res.data.data;
}

export async function getChecklist(txnId: string) {
  const res = await apiClient.get(`/documents/transaction/${txnId}/checklist`);
  return res.data.data;
}

export async function uploadDocument(txnId: string, documentType: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('documentType', documentType);
  const res = await apiClient.post(`/documents/transaction/${txnId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export async function getDownloadUrl(docId: string) {
  const res = await apiClient.get(`/documents/${docId}/download`);
  return res.data.data as { url: string; expiresAt: string };
}

export async function approveDocument(docId: string, reason?: string) {
  const res = await apiClient.post(`/documents/${docId}/approve`, { reason });
  return res.data.data;
}

export async function rejectDocument(docId: string, reason: string) {
  const res = await apiClient.post(`/documents/${docId}/reject`, { reason });
  return res.data.data;
}

export async function downloadAllDocuments(txnId: string): Promise<Blob> {
  const res = await apiClient.get(`/documents/transaction/${txnId}/download-all`, {
    responseType: 'blob',
  });
  return res.data;
}
