import { Router, type IRouter } from 'express';
import multer, { memoryStorage } from 'multer';
import { requireRole, ROLES } from '../../middleware/rbac.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { auditMutations } from '../../middleware/audit.js';
import { sanctionsRateLimit } from '../../lib/rate-limits.js';
import {
  CreateClientSchema,
  UpdateClientSchema,
  UploadKycDocSchema,
  RejectKycDocSchema,
  RejectKycSchema,
  SetFlagSchema,
  ManualScreeningSchema,
} from './clients.schemas.js';
import {
  createClientHandler,
  listClientsHandler,
  getClientHandler,
  updateClientHandler,
  getClientTransactionsHandler,
  getKycStatusHandler,
  getScreeningsHandler,
  uploadKycDocumentHandler,
  approveKycDocumentHandler,
  rejectKycDocumentHandler,
  approveFullKycHandler,
  rejectFullKycHandler,
  screenClientHandler,
  batchScreenHandler,
  manualScreeningHandler,
  setEddFlagHandler,
  setPepFlagHandler,
} from './clients.controller.js';

const upload = multer({
  storage: memoryStorage(),
  limits: { fileSize: 52_428_800 }, // 50 MiB
});

const ALL_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.COMPLIANCE_OFFICER,
  ROLES.TRADE_MANAGER,
  ROLES.OPERATIONS,
  ROLES.VIEWER,
] as const;

export const clientsRouter: IRouter = Router();

// Apply audit middleware to all mutating requests
clientsRouter.use(auditMutations());

// ---------------------------------------------------------------------------
// Static routes (must come before /:id)
// ---------------------------------------------------------------------------

// POST /screening/batch — batch re-screen all clients
clientsRouter.post(
  '/screening/batch',
  ...requireRole(ROLES.COMPLIANCE_OFFICER),
  batchScreenHandler,
);

// ---------------------------------------------------------------------------
// Client CRUD
// ---------------------------------------------------------------------------

clientsRouter.post(
  '/',
  ...requireRole(ROLES.OPERATIONS, ROLES.ADMIN),
  validateRequest(CreateClientSchema),
  createClientHandler,
);

clientsRouter.get('/', ...requireRole(...ALL_ROLES), listClientsHandler);

clientsRouter.get('/:id', ...requireRole(...ALL_ROLES), getClientHandler);

clientsRouter.put(
  '/:id',
  ...requireRole(ROLES.ADMIN, ROLES.COMPLIANCE_OFFICER),
  validateRequest(UpdateClientSchema),
  updateClientHandler,
);

// ---------------------------------------------------------------------------
// Client sub-resources
// ---------------------------------------------------------------------------

clientsRouter.get('/:id/transactions', ...requireRole(...ALL_ROLES), getClientTransactionsHandler);

clientsRouter.get('/:id/kyc', ...requireRole(...ALL_ROLES), getKycStatusHandler);

clientsRouter.get('/:id/screenings', ...requireRole(...ALL_ROLES), getScreeningsHandler);

// ---------------------------------------------------------------------------
// KYC document management
// ---------------------------------------------------------------------------

clientsRouter.post(
  '/:id/kyc/documents',
  ...requireRole(ROLES.OPERATIONS, ROLES.COMPLIANCE_OFFICER),
  upload.single('file'),
  validateRequest(UploadKycDocSchema),
  uploadKycDocumentHandler,
);

clientsRouter.put(
  '/:id/kyc/documents/:docId/approve',
  ...requireRole(ROLES.COMPLIANCE_OFFICER),
  approveKycDocumentHandler,
);

clientsRouter.put(
  '/:id/kyc/documents/:docId/reject',
  ...requireRole(ROLES.COMPLIANCE_OFFICER),
  validateRequest(RejectKycDocSchema),
  rejectKycDocumentHandler,
);

// ---------------------------------------------------------------------------
// Full KYC decision
// ---------------------------------------------------------------------------

clientsRouter.post(
  '/:id/kyc/approve',
  ...requireRole(ROLES.COMPLIANCE_OFFICER),
  approveFullKycHandler,
);

clientsRouter.post(
  '/:id/kyc/reject',
  ...requireRole(ROLES.COMPLIANCE_OFFICER),
  validateRequest(RejectKycSchema),
  rejectFullKycHandler,
);

// ---------------------------------------------------------------------------
// Sanctions screening
// ---------------------------------------------------------------------------

// Rate limited — 10/hour per user (API cost protection)
clientsRouter.post(
  '/:id/screening',
  ...requireRole(ROLES.COMPLIANCE_OFFICER, ROLES.ADMIN, ROLES.TRADE_MANAGER),
  sanctionsRateLimit,
  screenClientHandler,
);

clientsRouter.post(
  '/:id/screening/manual',
  ...requireRole(ROLES.COMPLIANCE_OFFICER, ROLES.ADMIN, ROLES.TRADE_MANAGER),
  validateRequest(ManualScreeningSchema),
  manualScreeningHandler,
);

// ---------------------------------------------------------------------------
// Flag management
// ---------------------------------------------------------------------------

clientsRouter.put(
  '/:id/flags/edd',
  ...requireRole(ROLES.COMPLIANCE_OFFICER),
  validateRequest(SetFlagSchema),
  setEddFlagHandler,
);

clientsRouter.put(
  '/:id/flags/pep',
  ...requireRole(ROLES.COMPLIANCE_OFFICER),
  validateRequest(SetFlagSchema),
  setPepFlagHandler,
);
