import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../lib/response.js';
import {
  createTransaction,
  listTransactions,
  getTransactionById,
  getTimeline,
  getChecklist,
  getValuation,
  advancePhase,
  overridePhase,
  addEvent,
  getDashboard,
} from './transactions.service.js';
import { ListTransactionsQuerySchema } from './transactions.schemas.js';

export async function createTransactionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await createTransaction(req.body, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function listTransactionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ListTransactionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400);
      return;
    }
    const { transactions, total, page, limit } = await listTransactions(parsed.data, req.user!);
    sendSuccess(res, transactions, 200, { page, limit, total });
  } catch (err) {
    next(err);
  }
}

export async function getTransactionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getTransactionById(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getDashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getDashboard(req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getTimelineHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getTimeline(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getChecklistHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getChecklist(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getValuationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getValuation(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function advancePhaseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await advancePhase(req.params.id, req.body, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function overridePhaseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await overridePhase(req.params.id, req.body, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function addEventHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.body.text) {
      sendError(res, 'VALIDATION_ERROR', 'Event text is required', 400);
      return;
    }
    const result = await addEvent(req.params.id, req.body, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}
