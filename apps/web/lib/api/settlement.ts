import { apiClient } from './client';

export interface Settlement {
  transactionId: string;
  goldWeightFine: string;
  lmePriceUsd: string;
  grossValueUsd: string;
  companyFeeUsd: string;
  agentCommissionUsd: string;
  logisticsCostUsd: string;
  refineryChargeUsd: string;
  customsDutiesUsd?: string;
  cifFreightUsd?: string;
  netPayableUsd: string;
  currency: string;
  fxRate: string;
  netPayableLocal: string;
  status: string;
  remittanceStatus?: string;
  discrepancyFlag?: boolean;
  discrepancyDetails?: string;
  calculatedAt?: string;
  settledAt?: string;
}

export async function getSettlement(txnId: string) {
  const res = await apiClient.get(`/settlements/transaction/${txnId}`);
  return res.data.data as Settlement;
}

export async function calculateSettlement(txnId: string, currency?: string) {
  const res = await apiClient.post(`/settlements/transaction/${txnId}/calculate`, {
    currency,
  });
  return res.data.data as Settlement;
}

export async function confirmSettlement(txnId: string) {
  const res = await apiClient.post(`/settlements/transaction/${txnId}/confirm`);
  return res.data.data as Settlement;
}

export async function clearDiscrepancyFlag(txnId: string, note: string) {
  const res = await apiClient.put(`/settlements/transaction/${txnId}/clear-discrepancy`, { note });
  return res.data.data;
}

export async function downloadSettlementStatement(txnId: string): Promise<Blob> {
  const res = await apiClient.get(`/settlements/transaction/${txnId}/statement`, {
    responseType: 'blob',
  });
  return res.data;
}

export async function generateRemittanceInstruction(txnId: string) {
  const res = await apiClient.post(`/settlements/transaction/${txnId}/remittance-instruction`);
  return res.data.data;
}

export const REMITTANCE_STATUSES = [
  'INSTRUCTION_GENERATED',
  'SUBMITTED',
  'CONFIRMED_SENT',
  'MINER_CONFIRMED',
] as const;

export type RemittanceStatus = (typeof REMITTANCE_STATUSES)[number];

export async function updateRemittanceStatus(txnId: string, status: RemittanceStatus) {
  const res = await apiClient.put(`/settlements/transaction/${txnId}/remittance-status`, {
    status,
  });
  return res.data.data as Settlement;
}
