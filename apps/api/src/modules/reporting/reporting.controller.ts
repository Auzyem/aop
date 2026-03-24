import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../lib/response.js';
import {
  listReports,
  generateReport,
  getReport,
  getDownloadUrl,
  submitReport,
  getSuspiciousTransactions,
  generateStrDraft,
  getReportSchedule,
  updateReportSchedule,
} from './reporting.service.js';
import { GenerateReportSchema, UpdateScheduleSchema } from './reporting.schemas.js';

export async function listReportsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reports = await listReports(req.user!);
    sendSuccess(res, reports);
  } catch (err) {
    next(err);
  }
}

export async function generateReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = GenerateReportSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten());
      return;
    }
    const report = await generateReport(parsed.data, req.user!);
    sendSuccess(res, report, 201);
  } catch (err) {
    next(err);
  }
}

export async function getReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await getReport(req.params.id, req.user!);
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
}

export async function getDownloadHandler(
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

export async function submitReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await submitReport(req.params.id, req.user!);
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
}

export async function getSuspiciousHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const transactions = await getSuspiciousTransactions(req.user!);
    sendSuccess(res, transactions);
  } catch (err) {
    next(err);
  }
}

export async function generateStrDraftHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { transactionId } = req.body as { transactionId?: string };
    if (!transactionId) {
      sendError(res, 'VALIDATION_ERROR', 'transactionId is required', 400);
      return;
    }
    const report = await generateStrDraft(transactionId, req.user!);
    sendSuccess(res, report, 201);
  } catch (err) {
    next(err);
  }
}

export async function getScheduleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schedule = await getReportSchedule();
    sendSuccess(res, schedule);
  } catch (err) {
    next(err);
  }
}

export async function updateScheduleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = UpdateScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid schedule data', 400, parsed.error.flatten());
      return;
    }
    const schedule = await updateReportSchedule(parsed.data, req.user!);
    sendSuccess(res, schedule);
  } catch (err) {
    next(err);
  }
}
