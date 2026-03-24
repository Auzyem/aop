import { Router, type IRouter } from 'express';
import { requireRole } from '../../middleware/rbac.js';
import { auditMutations } from '../../middleware/audit.js';
import {
  getSettlementHandler,
  calculateSettlementHandler,
  approveSettlementHandler,
  generateRemittanceHandler,
  updateRemittanceStatusHandler,
  notifyMinerHandler,
  discrepancyCheckHandler,
  clearDiscrepancyFlagHandler,
} from './settlement.controller.js';

const ALL_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPLIANCE_OFFICER',
  'TRADE_MANAGER',
  'OPERATIONS',
  'VIEWER',
] as const;

const FINANCE_AND_ABOVE = ['SUPER_ADMIN', 'TRADE_MANAGER'] as const;

export const settlementRouter: IRouter = Router();
settlementRouter.use(auditMutations());

// IMPORTANT: Define specific paths before /:id to avoid Express route param capture

// GET /settlements/transaction/:txnId
settlementRouter.get('/transaction/:txnId', ...requireRole(...ALL_ROLES), getSettlementHandler);

// GET /settlements/discrepancy-check/:txnId
settlementRouter.get(
  '/discrepancy-check/:txnId',
  ...requireRole(...ALL_ROLES),
  discrepancyCheckHandler,
);

// PUT /settlements/transaction/:txnId/clear-discrepancy
settlementRouter.put(
  '/transaction/:txnId/clear-discrepancy',
  ...requireRole('SUPER_ADMIN', 'TRADE_MANAGER', 'OPERATIONS'),
  clearDiscrepancyFlagHandler,
);

// POST /settlements/transaction/:txnId/calculate
settlementRouter.post(
  '/transaction/:txnId/calculate',
  ...requireRole(...ALL_ROLES),
  calculateSettlementHandler,
);

// PUT /settlements/:id/approve
settlementRouter.put(
  '/:id/approve',
  ...requireRole(...FINANCE_AND_ABOVE),
  approveSettlementHandler,
);

// POST /settlements/:id/remittance-instruction
settlementRouter.post(
  '/:id/remittance-instruction',
  ...requireRole(...FINANCE_AND_ABOVE),
  generateRemittanceHandler,
);

// PUT /settlements/:id/status
settlementRouter.put(
  '/:id/status',
  ...requireRole(...FINANCE_AND_ABOVE),
  updateRemittanceStatusHandler,
);

// POST /settlements/:id/notify-miner
settlementRouter.post(
  '/:id/notify-miner',
  ...requireRole(...FINANCE_AND_ABOVE),
  notifyMinerHandler,
);
