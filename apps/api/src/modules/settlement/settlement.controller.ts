import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../lib/response.js';
import {
  getSettlement,
  calculateSettlement,
  approveSettlement,
  generateRemittanceInstruction,
  updateRemittanceStatus,
  notifyMiner,
  discrepancyCheck,
  clearDiscrepancyFlag,
} from './settlement.service.js';
import { UpdateRemittanceStatusSchema, ClearDiscrepancySchema } from './settlement.schemas.js';

export async function getSettlementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getSettlement(req.params.txnId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function calculateSettlementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await calculateSettlement(req.params.txnId, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function approveSettlementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await approveSettlement(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function generateRemittanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await generateRemittanceInstruction(req.params.id, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateRemittanceStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = UpdateRemittanceStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid remittance status update', 400);
      return;
    }
    const result = await updateRemittanceStatus(req.params.id, parsed.data, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function notifyMinerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await notifyMiner(req.params.id);
    sendSuccess(res, { notified: true });
  } catch (err) {
    next(err);
  }
}

export async function clearDiscrepancyFlagHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ClearDiscrepancySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Note is required to clear discrepancy flag', 400);
      return;
    }
    const result = await clearDiscrepancyFlag(req.params.txnId, parsed.data, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function discrepancyCheckHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await discrepancyCheck(req.params.txnId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
