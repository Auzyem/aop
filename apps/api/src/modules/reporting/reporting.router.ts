import { Router, type IRouter } from 'express';
import { requireRole } from '../../middleware/rbac.js';
import { auditMutations } from '../../middleware/audit.js';
import {
  listReportsHandler,
  generateReportHandler,
  getReportHandler,
  getDownloadHandler,
  submitReportHandler,
  getSuspiciousHandler,
  generateStrDraftHandler,
  getScheduleHandler,
  updateScheduleHandler,
} from './reporting.controller.js';

const ALL_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPLIANCE_OFFICER',
  'TRADE_MANAGER',
  'OPERATIONS',
  'VIEWER',
] as const;

export const reportingRouter: IRouter = Router();
reportingRouter.use(auditMutations());

// ---------------------------------------------------------------------------
// IMPORTANT: static paths must be declared BEFORE /:id
// ---------------------------------------------------------------------------

// GET  /reports
reportingRouter.get('/', ...requireRole(...ALL_ROLES), listReportsHandler);

// POST /reports/generate
reportingRouter.post(
  '/generate',
  ...requireRole('COMPLIANCE_OFFICER', 'SUPER_ADMIN', 'ADMIN'),
  generateReportHandler,
);

// GET  /reports/suspicious-transactions  (static — BEFORE /:id)
reportingRouter.get(
  '/suspicious-transactions',
  ...requireRole('COMPLIANCE_OFFICER', 'SUPER_ADMIN'),
  getSuspiciousHandler,
);

// POST /reports/str/draft  (static — BEFORE /:id)
reportingRouter.post(
  '/str/draft',
  ...requireRole('COMPLIANCE_OFFICER', 'SUPER_ADMIN'),
  generateStrDraftHandler,
);

// GET  /reports/schedule  (static — BEFORE /:id)
reportingRouter.get('/schedule', ...requireRole(...ALL_ROLES), getScheduleHandler);

// PUT  /reports/schedule  (static — BEFORE /:id)
reportingRouter.put('/schedule', ...requireRole('SUPER_ADMIN', 'ADMIN'), updateScheduleHandler);

// GET  /reports/:id
reportingRouter.get('/:id', ...requireRole(...ALL_ROLES), getReportHandler);

// GET  /reports/:id/download
reportingRouter.get('/:id/download', ...requireRole(...ALL_ROLES), getDownloadHandler);

// POST /reports/:id/submit
reportingRouter.post(
  '/:id/submit',
  ...requireRole('COMPLIANCE_OFFICER', 'SUPER_ADMIN'),
  submitReportHandler,
);
