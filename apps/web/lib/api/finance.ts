import { apiClient } from './client';

export async function getCostItems(txnId: string) {
  const res = await apiClient.get(`/finance/transactions/${txnId}/costs`);
  return res.data.data;
}

export async function getDisbursements(txnId: string) {
  const res = await apiClient.get(`/finance/transactions/${txnId}/disbursements`);
  return res.data.data;
}

export async function getAgentBalance(agentId: string) {
  const res = await apiClient.get(`/finance/agents/${agentId}/balance`);
  return res.data.data;
}

export async function approveCostEstimate(txnId: string) {
  const res = await apiClient.post(`/finance/transactions/${txnId}/costs/approve`);
  return res.data.data;
}

export async function rejectCostEstimate(txnId: string, reason: string) {
  const res = await apiClient.post(`/finance/transactions/${txnId}/costs/reject`, { reason });
  return res.data.data;
}

export async function getCostApprovalStatus(txnId: string) {
  const res = await apiClient.get(`/finance/transactions/${txnId}/costs/approval-status`);
  return res.data.data as {
    status: string;
    approvedBy?: string;
    approvedAt?: string;
    rejectionReason?: string;
  };
}

export async function getAgentDisbursements(agentId: string) {
  const res = await apiClient.get(`/finance/agents/${agentId}/disbursements`);
  return res.data.data as Array<{
    id: string;
    txnId: string;
    trancheNo: number;
    amountUsd: number;
    status: string;
    bankRef?: string;
    requestedAt: string;
    paidAt?: string;
    note?: string;
    transaction?: { id: string; client?: { fullName: string } };
  }>;
}

export async function requestDisbursement(
  txnId: string,
  data: {
    trancheNo: number;
    amountUsd: number;
    note?: string;
  },
) {
  const res = await apiClient.post(`/finance/transactions/${txnId}/disbursements/request`, data);
  return res.data.data;
}

export async function uploadDisbursementReceipt(disbursementId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post(`/finance/disbursements/${disbursementId}/receipt`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export async function getAgentNextAction(txnId: string) {
  const res = await apiClient.get(`/transactions/${txnId}/agent-action`);
  return res.data.data as {
    type: 'UPLOAD_DOCUMENT' | 'UPLOAD_RECEIPT' | 'WAITING' | 'COMPLETE';
    description: string;
    documentType?: string;
    disbursementId?: string;
    costCategory?: string;
  };
}

export interface PortfolioSummary {
  totalGrossProceeds: number;
  totalCosts: number;
  companyFees: number;
  netProfit: number;
}

export async function getPortfolioSummary(params?: { from?: string; to?: string }) {
  const res = await apiClient.get('/finance/portfolio/summary', { params });
  return res.data.data as PortfolioSummary;
}

export interface MonthlyPnl {
  month: string;
  grossProceeds: number;
  costs: number;
  netProfit: number;
}

export async function getMonthlyPnl() {
  const res = await apiClient.get('/finance/portfolio/monthly-pnl');
  return res.data.data as MonthlyPnl[];
}

export interface CountryRevenue {
  countryCode: string;
  revenueUsd: number;
}

export async function getRevenueByCountry() {
  const res = await apiClient.get('/finance/portfolio/revenue-by-country');
  return res.data.data as CountryRevenue[];
}

export interface CostExposureRow {
  transactionId: string;
  clientName: string;
  phase: string;
  estGrossUsd: number;
  estCostsUsd: number;
  estNetUsd: number;
  companyFeeUsd: number;
}

export async function getCostExposure() {
  const res = await apiClient.get('/finance/portfolio/cost-exposure');
  return res.data.data as CostExposureRow[];
}

export interface UnreconciledBalance {
  agentId: string;
  agentName: string;
  unreconciledAmountUsd: number;
  oldestTransactionDaysAgo: number;
}

export async function getUnreconciledBalances() {
  const res = await apiClient.get('/finance/agents/unreconciled');
  return res.data.data as UnreconciledBalance[];
}

export async function listAllDisbursements(params?: Record<string, unknown>) {
  const res = await apiClient.get('/finance/disbursements', { params });
  return res.data;
}

export async function approveDisbursement(disbursementId: string) {
  const res = await apiClient.post(`/finance/disbursements/${disbursementId}/approve`);
  return res.data.data;
}

export async function rejectDisbursement(disbursementId: string, reason: string) {
  const res = await apiClient.post(`/finance/disbursements/${disbursementId}/reject`, { reason });
  return res.data.data;
}
