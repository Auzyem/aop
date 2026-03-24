import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../lib/response.js';
import {
  listDocuments,
  getDocumentById,
  getDownloadUrl,
  approveDocument,
  rejectDocument,
  getTransactionChecklist,
  deleteDocument,
} from './documents.service.js';
import { uploadDocument } from './document-upload.service.js';
import { generateSystemDocument } from './document-generator.service.js';
import { bundleTransactionDocuments } from './document-bundle.service.js';
import {
  ListDocumentsQuerySchema,
  UploadDocumentSchema,
  RejectDocSchema,
  GenerateDocSchema,
} from './documents.schemas.js';

// ---------------------------------------------------------------------------
// Document CRUD
// ---------------------------------------------------------------------------

export async function uploadDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, 'VALIDATION_ERROR', 'File is required', 400);
      return;
    }
    const parsed = UploadDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid request body', 400);
      return;
    }
    if (!parsed.data.transactionId && !parsed.data.clientId) {
      sendError(res, 'VALIDATION_ERROR', 'Either transactionId or clientId is required', 400);
      return;
    }
    const result = await uploadDocument(req.user!.id, parsed.data.documentType, req.file, {
      transactionId: parsed.data.transactionId,
      clientId: parsed.data.clientId,
    });
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function listDocumentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ListDocumentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400);
      return;
    }
    const { documents, total, page, limit } = await listDocuments(parsed.data, req.user!);
    sendSuccess(res, documents, 200, { page, limit, total });
  } catch (err) {
    next(err);
  }
}

export async function getDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getDocumentById(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function downloadDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const url = await getDownloadUrl(req.params.id, req.user!);
    sendSuccess(res, { url });
  } catch (err) {
    next(err);
  }
}

export async function approveDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await approveDocument(req.params.id, req.user!.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function rejectDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = RejectDocSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Rejection reason is required', 400);
      return;
    }
    const result = await rejectDocument(req.params.id, req.user!.id, parsed.data);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function deleteDocumentHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    deleteDocument();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Transaction document endpoints
// ---------------------------------------------------------------------------

export async function getChecklistHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getTransactionChecklist(req.params.transactionId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function generateDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = GenerateDocSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid document type', 400);
      return;
    }
    const result = await generateSystemDocument(
      req.params.transactionId,
      parsed.data,
      req.user!.id,
    );
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function bundleDocumentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await bundleTransactionDocuments(req.params.transactionId, req.user!, res);
  } catch (err) {
    next(err);
  }
}
