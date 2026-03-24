import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../lib/response.js';
import {
  createClient,
  listClients,
  getClientById,
  updateClient,
  getClientTransactions,
  getClientScreenings,
  setEddFlag,
  setPepFlag,
} from './clients.service.js';
import {
  getKycStatus,
  approveKycDocument,
  rejectKycDocument,
  approveFullKyc,
  rejectFullKyc,
} from './kyc.service.js';
import { uploadKycDocument } from './document.service.js';
import { screenClient, batchScreenAll } from './sanctions.service.js';
import { ListClientsQuerySchema } from './clients.schemas.js';

// ---------------------------------------------------------------------------
// Client CRUD
// ---------------------------------------------------------------------------

export async function createClientHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await createClient(req.body, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function listClientsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = ListClientsQuerySchema.parse(req.query);
    const result = await listClients(query, req.user!);
    sendSuccess(res, result.clients, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
}

export async function getClientHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getClientById(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function updateClientHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await updateClient(req.params.id, req.body, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getClientTransactionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const result = await getClientTransactions(req.params.id, req.user!, page, limit);
    sendSuccess(res, result.transactions, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// KYC status & documents
// ---------------------------------------------------------------------------

export async function getKycStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getKycStatus(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getScreeningsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getClientScreenings(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function uploadKycDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, 'VALIDATION_ERROR', 'File is required', 400);
      return;
    }
    const result = await uploadKycDocument(
      req.params.id,
      req.user!.id,
      req.body.documentType,
      req.file,
    );
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function approveKycDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await approveKycDocument(req.params.docId, req.user!.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function rejectKycDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await rejectKycDocument(req.params.docId, req.user!.id, req.body.reason);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function approveFullKycHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await approveFullKyc(req.params.id, req.user!.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function rejectFullKycHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await rejectFullKyc(req.params.id, req.user!.id, req.body.reason);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Sanctions screening
// ---------------------------------------------------------------------------

export async function screenClientHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await screenClient(req.params.id, req.user!.id);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function batchScreenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await batchScreenAll(req.user!.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

export async function setEddFlagHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await setEddFlag(req.params.id, req.body.value, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function setPepFlagHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await setPepFlag(req.params.id, req.body.value, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
