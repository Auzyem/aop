import { Router, type IRouter } from 'express';
import { requireRole } from '../../middleware/rbac.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { auditMutations } from '../../middleware/audit.js';
import {
  createTransactionHandler,
  listTransactionsHandler,
  getTransactionHandler,
  getDashboardHandler,
  getTimelineHandler,
  getChecklistHandler,
  getValuationHandler,
  advancePhaseHandler,
  overridePhaseHandler,
  addEventHandler,
} from './transactions.controller.js';
import {
  CreateTransactionSchema,
  AdvancePhaseSchema,
  OverridePhaseSchema,
  AddEventSchema,
} from './transactions.schemas.js';

const ALL_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPLIANCE_OFFICER',
  'TRADE_MANAGER',
  'OPERATIONS',
  'VIEWER',
] as const;

export const transactionsRouter: IRouter = Router();
transactionsRouter.use(auditMutations());

// ---------------------------------------------------------------------------
// Static paths MUST be defined before /:id to prevent route collision
// ---------------------------------------------------------------------------

// GET  /transactions/dashboard
transactionsRouter.get('/dashboard', requireRole(...ALL_ROLES), getDashboardHandler);

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

// POST /transactions
transactionsRouter.post(
  '/',
  requireRole('ADMIN', 'OPERATIONS'),
  validateRequest(CreateTransactionSchema),
  createTransactionHandler,
);

// GET  /transactions
transactionsRouter.get('/', requireRole(...ALL_ROLES), listTransactionsHandler);

// ---------------------------------------------------------------------------
// Per-transaction
// ---------------------------------------------------------------------------

// GET  /transactions/:id
transactionsRouter.get('/:id', requireRole(...ALL_ROLES), getTransactionHandler);

// GET  /transactions/:id/timeline
transactionsRouter.get('/:id/timeline', requireRole(...ALL_ROLES), getTimelineHandler);

// GET  /transactions/:id/checklist
transactionsRouter.get('/:id/checklist', requireRole(...ALL_ROLES), getChecklistHandler);

// GET  /transactions/:id/valuation
transactionsRouter.get(
  '/:id/valuation',
  requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER', 'OPERATIONS'),
  getValuationHandler,
);

// POST /transactions/:id/advance
transactionsRouter.post(
  '/:id/advance',
  requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'OPERATIONS'),
  validateRequest(AdvancePhaseSchema),
  advancePhaseHandler,
);

// POST /transactions/:id/override
transactionsRouter.post(
  '/:id/override',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  validateRequest(OverridePhaseSchema),
  overridePhaseHandler,
);

// POST /transactions/:id/events
transactionsRouter.post(
  '/:id/events',
  requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER', 'OPERATIONS'),
  validateRequest(AddEventSchema),
  addEventHandler,
);
