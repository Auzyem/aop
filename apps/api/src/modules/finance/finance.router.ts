import { Router, type IRouter } from 'express';
import multer, { memoryStorage } from 'multer';
import { requireRole } from '../../middleware/rbac.js';
import { auditMutations } from '../../middleware/audit.js';
import {
  getCostItemsHandler,
  addCostItemHandler,
  updateCostItemHandler,
  getCostEstimateHandler,
  submitEstimateHandler,
  approveEstimateHandler,
  rejectEstimateHandler,
  getDisbursementsHandler,
  requestDisbursementHandler,
  approveDisbursementHandler,
  markDisbursementSentHandler,
  uploadReceiptHandler,
  approveReceiptHandler,
  queryReceiptHandler,
  getAgentBalanceHandler,
  getPortfolioPnlHandler,
  getActiveExposureHandler,
} from './finance.controller.js';

// Role aliases for readability
// FINANCE → TRADE_MANAGER  (financial oversight)
// CEO     → SUPER_ADMIN    (top-level approval authority)
// AGENT   → OPERATIONS     (field agents)

const ALL_FINANCE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPLIANCE_OFFICER',
  'TRADE_MANAGER',
  'OPERATIONS',
  'VIEWER',
] as const;

const FINANCE_AND_ABOVE = ['SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER'] as const;

const upload = multer({ storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const financeRouter: IRouter = Router();
financeRouter.use(auditMutations());

// ---------------------------------------------------------------------------
// Cost Items  /finance/transactions/:txnId/costs
// ---------------------------------------------------------------------------

financeRouter.get(
  '/transactions/:txnId/costs',
  ...requireRole(...ALL_FINANCE_ROLES),
  getCostItemsHandler,
);

financeRouter.post(
  '/transactions/:txnId/costs',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS'),
  addCostItemHandler,
);

financeRouter.put(
  '/transactions/:txnId/costs/:id',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS'),
  updateCostItemHandler,
);

// ---------------------------------------------------------------------------
// Cost Estimate  /finance/transactions/:txnId/estimate
// ---------------------------------------------------------------------------

financeRouter.get(
  '/transactions/:txnId/estimate',
  ...requireRole(...ALL_FINANCE_ROLES),
  getCostEstimateHandler,
);

financeRouter.post(
  '/transactions/:txnId/estimate/submit',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS'),
  submitEstimateHandler,
);

// Approve: TRADE_MANAGER (< threshold) or SUPER_ADMIN (>= threshold) — enforced in service
financeRouter.post(
  '/transactions/:txnId/estimate/approve',
  ...requireRole('SUPER_ADMIN', 'TRADE_MANAGER'),
  approveEstimateHandler,
);

financeRouter.post(
  '/transactions/:txnId/estimate/reject',
  ...requireRole('SUPER_ADMIN', 'TRADE_MANAGER'),
  rejectEstimateHandler,
);

// ---------------------------------------------------------------------------
// Disbursements  /finance/transactions/:txnId/disbursements
// ---------------------------------------------------------------------------

financeRouter.get(
  '/transactions/:txnId/disbursements',
  ...requireRole(...ALL_FINANCE_ROLES),
  getDisbursementsHandler,
);

financeRouter.post(
  '/transactions/:txnId/disbursements',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS'),
  requestDisbursementHandler,
);

// ---------------------------------------------------------------------------
// Disbursement actions  /finance/disbursements/:id/...
// ---------------------------------------------------------------------------

financeRouter.post(
  '/disbursements/:id/approve',
  ...requireRole(...FINANCE_AND_ABOVE),
  approveDisbursementHandler,
);

financeRouter.post(
  '/disbursements/:id/mark-sent',
  ...requireRole(...FINANCE_AND_ABOVE),
  markDisbursementSentHandler,
);

financeRouter.post(
  '/disbursements/:id/receipts',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS'),
  upload.single('file'),
  uploadReceiptHandler,
);

financeRouter.put(
  '/disbursements/:id/receipts/:rid/approve',
  ...requireRole(...FINANCE_AND_ABOVE),
  approveReceiptHandler,
);

financeRouter.put(
  '/disbursements/:id/receipts/:rid/query',
  ...requireRole(...FINANCE_AND_ABOVE),
  queryReceiptHandler,
);

// ---------------------------------------------------------------------------
// Dashboard  /finance/dashboard/...  and  /finance/agents/:agentId/balance
// ---------------------------------------------------------------------------

financeRouter.get(
  '/agents/:agentId/balance',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER', 'OPERATIONS'),
  getAgentBalanceHandler,
);

// GET /finance/dashboard/portfolio — define before /dashboard/active-exposure
financeRouter.get(
  '/dashboard/portfolio',
  ...requireRole(...FINANCE_AND_ABOVE),
  getPortfolioPnlHandler,
);

financeRouter.get(
  '/dashboard/active-exposure',
  ...requireRole(...FINANCE_AND_ABOVE),
  getActiveExposureHandler,
);
