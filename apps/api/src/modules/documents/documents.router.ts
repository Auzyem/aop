import { Router, type IRouter } from 'express';
import multer, { memoryStorage } from 'multer';
import { requireRole } from '../../middleware/rbac.js';
import { auditMutations } from '../../middleware/audit.js';
import { documentUploadRateLimit } from '../../lib/rate-limits.js';
import {
  uploadDocumentHandler,
  listDocumentsHandler,
  getDocumentHandler,
  downloadDocumentHandler,
  approveDocumentHandler,
  rejectDocumentHandler,
  deleteDocumentHandler,
  getChecklistHandler,
  generateDocumentHandler,
  bundleDocumentsHandler,
} from './documents.controller.js';

const ALL_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPLIANCE_OFFICER',
  'TRADE_MANAGER',
  'OPERATIONS',
  'VIEWER',
] as const;

const upload = multer({ storage: memoryStorage(), limits: { fileSize: 52_428_800 } });

export const documentsRouter: IRouter = Router();
documentsRouter.use(auditMutations());

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

// POST /documents (upload) — rate limited: 20/min per user
documentsRouter.post(
  '/',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER', 'OPERATIONS'),
  documentUploadRateLimit,
  upload.single('file'),
  uploadDocumentHandler,
);

// GET /documents
documentsRouter.get('/', ...requireRole(...ALL_ROLES), listDocumentsHandler);

// ---------------------------------------------------------------------------
// Static sub-paths BEFORE /:id to prevent route collision
// ---------------------------------------------------------------------------

// GET /documents/transactions/:transactionId/checklist
documentsRouter.get(
  '/transactions/:transactionId/checklist',
  ...requireRole(...ALL_ROLES),
  getChecklistHandler,
);

// POST /documents/transactions/:transactionId/generate
documentsRouter.post(
  '/transactions/:transactionId/generate',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER'),
  generateDocumentHandler,
);

// GET /documents/transactions/:transactionId/bundle
documentsRouter.get(
  '/transactions/:transactionId/bundle',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER', 'OPERATIONS'),
  bundleDocumentsHandler,
);

// ---------------------------------------------------------------------------
// Per-document  (dynamic /:id — defined AFTER all static sub-paths)
// ---------------------------------------------------------------------------

// GET /documents/:id
documentsRouter.get('/:id', ...requireRole(...ALL_ROLES), getDocumentHandler);

// GET /documents/:id/download
documentsRouter.get('/:id/download', ...requireRole(...ALL_ROLES), downloadDocumentHandler);

// PUT /documents/:id/approve
documentsRouter.put(
  '/:id/approve',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER'),
  approveDocumentHandler,
);

// PUT /documents/:id/reject
documentsRouter.put(
  '/:id/reject',
  ...requireRole('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER'),
  rejectDocumentHandler,
);

// DELETE /documents/:id — always 403
documentsRouter.delete('/:id', ...requireRole(...ALL_ROLES), deleteDocumentHandler);
