import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../lib/response.js';
import { getCurrentLmePrice, getPriceHistory } from './lme-feed.service.js';
import { lockTransactionPrice } from './lme-lock.service.js';
import { listRefineries, createRefinery, updateRefinery } from './refineries.service.js';
import { getTransactionValuation } from './lme-valuation.service.js';
import { getTradeDeskDashboard } from './lme-dashboard.service.js';
import {
  PriceLockSchema,
  PriceHistoryQuerySchema,
  CreateRefinerySchema,
  UpdateRefinerySchema,
} from './lme.schemas.js';

export async function getCurrentPriceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getCurrentLmePrice();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getPriceHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = PriceHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400);
      return;
    }
    const result = await getPriceHistory(parsed.data);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function lockPriceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = PriceLockSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid price lock data', 400);
      return;
    }
    const result = await lockTransactionPrice(req.params.txnId, parsed.data, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function listRefineriesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listRefineries();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function createRefineryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = CreateRefinerySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid refinery data', 400);
      return;
    }
    const result = await createRefinery(parsed.data);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateRefineryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = UpdateRefinerySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid refinery data', 400);
      return;
    }
    const result = await updateRefinery(req.params.id, parsed.data);
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
    const result = await getTransactionValuation(req.params.txnId, req.user!);
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
    const result = await getTradeDeskDashboard(req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
