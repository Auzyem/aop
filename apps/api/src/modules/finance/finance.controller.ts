import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../lib/response.js';
import {
  getCostItems,
  addCostItem,
  updateCostItem,
  getCostEstimate,
  submitEstimate,
  approveEstimate,
  rejectEstimate,
} from './costs.service.js';
import {
  getDisbursements,
  requestDisbursement,
  approveDisbursement,
  markDisbursementSent,
  uploadReceipt,
  approveReceipt,
  queryReceipt,
} from './disbursements.service.js';
import { getAgentBalance, getPortfolioPnl, getActiveExposure } from './dashboard.service.js';
import {
  AddCostItemSchema,
  UpdateCostItemSchema,
  RejectEstimateSchema,
  RequestDisbursementSchema,
  QueryReceiptSchema,
  PortfolioPnlQuerySchema,
} from './finance.schemas.js';

// ---------------------------------------------------------------------------
// Cost Items
// ---------------------------------------------------------------------------

export async function getCostItemsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getCostItems(req.params.txnId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function addCostItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = AddCostItemSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid cost item data', 400);
      return;
    }
    const result = await addCostItem(req.params.txnId, parsed.data, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateCostItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = UpdateCostItemSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid cost item data', 400);
      return;
    }
    const result = await updateCostItem(req.params.txnId, req.params.id, parsed.data, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Cost Estimate
// ---------------------------------------------------------------------------

export async function getCostEstimateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getCostEstimate(req.params.txnId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function submitEstimateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await submitEstimate(req.params.txnId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function approveEstimateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await approveEstimate(req.params.txnId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function rejectEstimateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = RejectEstimateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Rejection reason is required', 400);
      return;
    }
    const result = await rejectEstimate(req.params.txnId, parsed.data, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Disbursements
// ---------------------------------------------------------------------------

export async function getDisbursementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getDisbursements(req.params.txnId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function requestDisbursementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = RequestDisbursementSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid disbursement request', 400);
      return;
    }
    const result = await requestDisbursement(req.params.txnId, parsed.data, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function approveDisbursementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await approveDisbursement(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function markDisbursementSentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await markDisbursementSent(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function uploadReceiptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, 'VALIDATION_ERROR', 'File is required', 400);
      return;
    }
    const result = await uploadReceipt(req.params.id, req.file, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function approveReceiptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await approveReceipt(req.params.id, req.params.rid, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function queryReceiptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = QueryReceiptSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Query note is required', 400);
      return;
    }
    const result = await queryReceipt(req.params.id, req.params.rid, parsed.data, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getAgentBalanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getAgentBalance(req.params.agentId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getPortfolioPnlHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = PortfolioPnlQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400);
      return;
    }
    const result = await getPortfolioPnl(parsed.data, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getActiveExposureHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getActiveExposure(req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
