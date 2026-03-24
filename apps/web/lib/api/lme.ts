import { apiClient } from './client';

export async function getCurrentPrice() {
  const res = await apiClient.get('/lme/price/current');
  return res.data.data as { priceUsdPerTroyOz: number; recordedAt: string; stale: boolean };
}

export async function getPriceHistory(params?: Record<string, unknown>) {
  const res = await apiClient.get('/lme/price/history', { params });
  return res.data.data as Array<{ price: number; recordedAt: string; priceType: string }>;
}

export async function getDashboard() {
  const res = await apiClient.get('/lme/dashboard');
  return res.data.data;
}

export interface PriceLockPayload {
  priceType: 'SPOT' | 'AM_FIX' | 'PM_FIX' | 'FORWARD';
  lockedPrice: number;
  reason?: string;
}

export interface PriceLockResult {
  lockedPrice: number;
  priceType: string;
  lockedAt: string;
  pdfUrl?: string;
}

export async function lockPrice(txnId: string, data: PriceLockPayload): Promise<PriceLockResult> {
  const res = await apiClient.post(`/lme/price/lock/${txnId}`, data);
  return res.data.data as PriceLockResult;
}

export interface PriceAlert {
  id: string;
  transactionId: string;
  originalPrice: number;
  currentPrice: number;
  changePct: number;
  direction: 'UP' | 'DOWN';
  alertedAt: string;
}

export async function getPriceAlerts() {
  const res = await apiClient.get('/lme/alerts');
  return res.data.data as PriceAlert[];
}

export async function generateValuationPdf(txnId: string): Promise<Blob> {
  const res = await apiClient.get(`/lme/price/lock/${txnId}/pdf`, { responseType: 'blob' });
  return res.data;
}

export async function getTransactionsAwaitingLock() {
  const res = await apiClient.get('/lme/transactions/awaiting-lock');
  return res.data.data as Array<{
    id: string;
    client?: { fullName: string };
    goldWeightFine?: number;
    goldWeightGross?: number;
    phase: string;
    createdAt: string;
  }>;
}

export async function getRefineryPipeline() {
  const res = await apiClient.get('/lme/refinery/pipeline');
  return res.data.data as Array<{
    id: string;
    client?: { fullName: string };
    phase: string;
    refineryName?: string;
    deliveryStatus?: string;
    goldWeightFine?: number;
  }>;
}
