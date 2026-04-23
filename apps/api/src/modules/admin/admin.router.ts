import { Router, type IRouter } from 'express';
import { requireRole } from '../../middleware/rbac.js';
import { auditMutations } from '../../middleware/audit.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { CreateUserSchema } from './admin.schemas.js';
import {
  listUsersHandler,
  createUserHandler,
  getUserHandler,
  updateUserHandler,
  deactivateUserHandler,
  reset2faHandler,
  resetPasswordHandler,
  listAgentsHandler,
  createAgentHandler,
  getAgentHandler,
  updateAgentHandler,
  deactivateAgentHandler,
  getAgentBalanceHandler,
  getAgentTransactionsHandler,
  getSettingsHandler,
  updateSettingHandler,
  queryAuditLogHandler,
  exportAuditCsvHandler,
  verifyAuditIntegrityHandler,
  exportSubjectDataHandler,
  requestDeletionHandler,
} from './admin.controller.js';

export const adminRouter: IRouter = Router();
adminRouter.use(auditMutations());

const HEAD_OFFICE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPLIANCE_OFFICER',
  'TRADE_MANAGER',
  'VIEWER',
] as const;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

adminRouter.get('/users', ...requireRole('SUPER_ADMIN', 'ADMIN'), listUsersHandler);
adminRouter.post(
  '/users',
  ...requireRole('SUPER_ADMIN', 'ADMIN'),
  validateRequest(CreateUserSchema),
  createUserHandler,
);

// Sub-routes BEFORE generic /:id
adminRouter.post('/users/:id/reset-2fa', ...requireRole('SUPER_ADMIN', 'ADMIN'), reset2faHandler);
adminRouter.post(
  '/users/:id/reset-password',
  ...requireRole('SUPER_ADMIN', 'ADMIN'),
  resetPasswordHandler,
);

adminRouter.get('/users/:id', ...requireRole('SUPER_ADMIN', 'ADMIN'), getUserHandler);
adminRouter.put('/users/:id', ...requireRole('SUPER_ADMIN', 'ADMIN'), updateUserHandler);
adminRouter.delete('/users/:id', ...requireRole('SUPER_ADMIN', 'ADMIN'), deactivateUserHandler);

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

adminRouter.get('/agents', ...requireRole(...HEAD_OFFICE_ROLES), listAgentsHandler);
adminRouter.post(
  '/agents',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER'),
  createAgentHandler,
);

// Sub-routes BEFORE generic /:id
adminRouter.get(
  '/agents/:id/balance',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'TRADE_MANAGER'),
  getAgentBalanceHandler,
);
adminRouter.get(
  '/agents/:id/transactions',
  ...requireRole(...HEAD_OFFICE_ROLES),
  getAgentTransactionsHandler,
);
adminRouter.put(
  '/agents/:id/deactivate',
  ...requireRole('SUPER_ADMIN', 'ADMIN'),
  deactivateAgentHandler,
);

adminRouter.get('/agents/:id', ...requireRole(...HEAD_OFFICE_ROLES), getAgentHandler);
adminRouter.put('/agents/:id', ...requireRole('SUPER_ADMIN', 'ADMIN'), updateAgentHandler);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

adminRouter.get('/settings', ...requireRole(...HEAD_OFFICE_ROLES), getSettingsHandler);
adminRouter.put('/settings/:key', ...requireRole('SUPER_ADMIN', 'ADMIN'), updateSettingHandler);

// ---------------------------------------------------------------------------
// Audit log — /audit/export MUST be before /audit
// ---------------------------------------------------------------------------

adminRouter.get(
  '/audit/export',
  ...requireRole('SUPER_ADMIN', 'COMPLIANCE_OFFICER'),
  exportAuditCsvHandler,
);
adminRouter.get(
  '/audit/verify',
  ...requireRole('SUPER_ADMIN', 'ADMIN'),
  verifyAuditIntegrityHandler,
);
adminRouter.get(
  '/audit',
  ...requireRole('SUPER_ADMIN', 'COMPLIANCE_OFFICER'),
  queryAuditLogHandler,
);

// ---------------------------------------------------------------------------
// GDPR / POPIA data management
// ---------------------------------------------------------------------------

adminRouter.post(
  '/data/export-subject-data',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER'),
  exportSubjectDataHandler,
);
adminRouter.post(
  '/data/request-deletion',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER'),
  requestDeletionHandler,
);
