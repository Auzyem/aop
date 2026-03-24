import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../lib/response.js';
import {
  listUsers,
  createUser,
  getUserById,
  updateUser,
  deactivateUser,
  reset2fa,
  resetPassword,
} from './users.service.js';
import {
  listAgents,
  createAgent,
  getAgentById,
  updateAgent,
  deactivateAgent,
  getAgentBalance,
  getAgentTransactions,
} from './agents.service.js';
import { getAllSettings, updateSetting } from './settings.service.js';
import { queryAuditLog, exportAuditCsv, verifyAuditIntegrity } from './audit.service.js';
import { exportSubjectData, requestDeletion } from './data.service.js';
import {
  CreateUserSchema,
  UpdateUserSchema,
  CreateAgentSchema,
  UpdateAgentSchema,
  UpdateSettingSchema,
  AuditLogQuerySchema,
  ListUsersQuerySchema,
  ListAgentsQuerySchema,
  ExportSubjectDataSchema,
  DeletionRequestSchema,
} from './admin.schemas.js';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ListUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400);
      return;
    }
    const result = await listUsers(parsed.data, req.user!);
    sendSuccess(res, result.users, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
}

export async function createUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid user data', 400);
      return;
    }
    const result = await createUser(parsed.data, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function getUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getUserById(req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function updateUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = UpdateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid user data', 400);
      return;
    }
    const result = await updateUser(req.params.id, parsed.data, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function deactivateUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await deactivateUser(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function reset2faHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await reset2fa(req.params.id, req.user!);
    sendSuccess(res, { message: '2FA reset successfully' });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await resetPassword(req.params.id, req.user!);
    sendSuccess(res, { message: 'Password reset email sent' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function listAgentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ListAgentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400);
      return;
    }
    const result = await listAgents(parsed.data, req.user!);
    sendSuccess(res, result.agents, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
}

export async function createAgentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = CreateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid agent data', 400);
      return;
    }
    const result = await createAgent(parsed.data, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function getAgentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getAgentById(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function updateAgentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = UpdateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid agent data', 400);
      return;
    }
    const result = await updateAgent(req.params.id, parsed.data, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function deactivateAgentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await deactivateAgent(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getAgentBalanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getAgentBalance(req.params.id, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getAgentTransactionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const result = await getAgentTransactions(req.params.id, req.user!, { page, limit });
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
// Settings
// ---------------------------------------------------------------------------

export async function getSettingsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getAllSettings();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function updateSettingHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = UpdateSettingSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid setting value', 400);
      return;
    }
    const result = await updateSetting(req.params.key, parsed.data.value, req.user!.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function queryAuditLogHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = AuditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400);
      return;
    }
    const result = await queryAuditLog(parsed.data, req.user!);
    sendSuccess(res, result.events, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
}

export async function exportAuditCsvHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = AuditLogQuerySchema.safeParse({ ...req.query, page: 1, limit: 50 });
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', 400);
      return;
    }
    const csv = await exportAuditCsv(parsed.data, req.user!);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${Date.now()}.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}

export async function verifyAuditIntegrityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await verifyAuditIntegrity(req.user!);
    const statusCode = result.tampered > 0 ? 200 : 200;
    sendSuccess(res, result, statusCode);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GDPR / POPIA data management
// ---------------------------------------------------------------------------

export async function exportSubjectDataHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ExportSubjectDataSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid request body', 400);
      return;
    }
    const result = await exportSubjectData(parsed.data.clientId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function requestDeletionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = DeletionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid request body', 400);
      return;
    }
    const result = await requestDeletion(parsed.data.clientId, parsed.data.reason, req.user!);
    sendSuccess(res, result, 202);
  } catch (err) {
    next(err);
  }
}
