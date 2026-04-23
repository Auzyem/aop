import { Router, type IRouter } from 'express';
import { requireRole } from '../../middleware/rbac.js';
import { auditMutations } from '../../middleware/audit.js';
import {
  getCurrentPriceHandler,
  getPriceHistoryHandler,
  lockPriceHandler,
  listRefineriesHandler,
  createRefineryHandler,
  updateRefineryHandler,
  getValuationHandler,
  getDashboardHandler,
  getPriceAlertsHandler,
  getTransactionsAwaitingLockHandler,
  getRefineryPipelineHandler,
} from './lme.controller.js';

// TRADE_DESK → TRADE_MANAGER

const ALL_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPLIANCE_OFFICER',
  'TRADE_MANAGER',
  'OPERATIONS',
  'VIEWER',
] as const;

export const lmeRouter: IRouter = Router();
lmeRouter.use(auditMutations());

// ---------------------------------------------------------------------------
// Price feed — static paths first
// ---------------------------------------------------------------------------

// GET /lme/price/current
lmeRouter.get('/price/current', ...requireRole(...ALL_ROLES), getCurrentPriceHandler);

// GET /lme/price/history
lmeRouter.get('/price/history', ...requireRole(...ALL_ROLES), getPriceHistoryHandler);

// POST /lme/price/lock/:txnId
lmeRouter.post(
  '/price/lock/:txnId',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER'),
  lockPriceHandler,
);

// ---------------------------------------------------------------------------
// Refineries
// ---------------------------------------------------------------------------

// GET /lme/refineries
lmeRouter.get('/refineries', ...requireRole(...ALL_ROLES), listRefineriesHandler);

// POST /lme/refineries
lmeRouter.post('/refineries', ...requireRole('SUPER_ADMIN', 'ADMIN'), createRefineryHandler);

// PUT /lme/refineries/:id
lmeRouter.put('/refineries/:id', ...requireRole('SUPER_ADMIN', 'ADMIN'), updateRefineryHandler);

// ---------------------------------------------------------------------------
// Valuation & dashboard — static paths before /:txnId
// ---------------------------------------------------------------------------

// GET /lme/dashboard
lmeRouter.get(
  '/dashboard',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER'),
  getDashboardHandler,
);

// GET /lme/valuation/:txnId
lmeRouter.get(
  '/valuation/:txnId',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER', 'OPERATIONS'),
  getValuationHandler,
);

// GET /lme/alerts
lmeRouter.get('/alerts', ...requireRole(...ALL_ROLES), getPriceAlertsHandler);

// GET /lme/transactions/awaiting-lock
lmeRouter.get(
  '/transactions/awaiting-lock',
  ...requireRole(...ALL_ROLES),
  getTransactionsAwaitingLockHandler,
);

// GET /lme/refinery/pipeline
lmeRouter.get('/refinery/pipeline', ...requireRole(...ALL_ROLES), getRefineryPipelineHandler);
