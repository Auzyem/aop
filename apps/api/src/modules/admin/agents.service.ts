import { prisma } from '@aop/db';
import { NotFoundError } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import type { CreateAgentDto, UpdateAgentDto, ListAgentsQuery } from './admin.schemas.js';

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listAgents(query: ListAgentsQuery, _actor: AuthenticatedUser) {
  const { country, isActive, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (country) where.countryCode = country;
  if (isActive !== undefined) where.isActive = isActive;

  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.agent.count({ where }),
  ]);

  return { agents, total, page, limit };
}

export async function createAgent(dto: CreateAgentDto, _actor: AuthenticatedUser) {
  return prisma.agent.create({
    data: {
      companyName: dto.companyName,
      countryCode: dto.countryCode,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail ?? null,
      licenceNo: dto.licenceNo,
      bankName: dto.bankName ?? null,
      bankAccount: dto.bankAccount ?? null,
      swiftBic: dto.swiftBic ?? null,
    },
  });
}

export async function getAgentById(id: string, _actor: AuthenticatedUser) {
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      users: {
        where: { isActive: true },
        select: { id: true, email: true, role: true },
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          phase: true,
          status: true,
          countryCode: true,
          createdAt: true,
        },
      },
    },
  });

  if (!agent) throw new NotFoundError('Agent not found');

  // Calculate outstanding balance: sent disbursements without approved receipts
  const sentDisbursements = await prisma.disbursement.findMany({
    where: { agentId: id, status: 'SENT' },
    include: {
      receipts: {
        where: { status: 'APPROVED' },
        select: { id: true },
      },
    },
  });

  let outstandingBalanceUsd = 0;
  for (const d of sentDisbursements) {
    if (d.receipts.length === 0) {
      outstandingBalanceUsd += Number(d.amountUsd);
    }
  }

  return {
    ...agent,
    usersCount: agent.users.length,
    outstandingBalanceUsd,
  };
}

export async function updateAgent(id: string, dto: UpdateAgentDto, _actor: AuthenticatedUser) {
  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Agent not found');

  return prisma.agent.update({
    where: { id },
    data: {
      ...(dto.companyName !== undefined && { companyName: dto.companyName }),
      ...(dto.countryCode !== undefined && { countryCode: dto.countryCode }),
      ...(dto.contactName !== undefined && { contactName: dto.contactName }),
      ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
      ...(dto.licenceNo !== undefined && { licenceNo: dto.licenceNo }),
      ...(dto.bankName !== undefined && { bankName: dto.bankName }),
      ...(dto.bankAccount !== undefined && { bankAccount: dto.bankAccount }),
      ...(dto.swiftBic !== undefined && { swiftBic: dto.swiftBic }),
    },
  });
}

export async function deactivateAgent(id: string, _actor: AuthenticatedUser) {
  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Agent not found');

  return prisma.agent.update({
    where: { id },
    data: { isActive: false },
  });
}

export async function getAgentBalance(id: string, _actor: AuthenticatedUser) {
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw new NotFoundError('Agent not found');

  const disbursements = await prisma.disbursement.findMany({
    where: { agentId: id, status: 'SENT' },
    include: {
      receipts: { orderBy: { uploadedAt: 'desc' }, take: 1 },
    },
    orderBy: { sentAt: 'asc' },
  });

  const now = Date.now();
  const OVERDUE_MS = 48 * 60 * 60 * 1000;

  let totalSentUsd = 0;
  let totalReconciledUsd = 0;

  const items = disbursements.map((d) => {
    const amount = Number(d.amountUsd);
    totalSentUsd += amount;

    const latestReceipt = d.receipts[0] ?? null;
    const receiptStatus = latestReceipt?.status ?? null;

    if (receiptStatus === 'APPROVED') {
      totalReconciledUsd += amount;
    }

    const isOverdue =
      receiptStatus !== 'APPROVED' && d.sentAt != null && now - d.sentAt.getTime() > OVERDUE_MS;

    return {
      disbursementId: d.id,
      trancheNo: d.trancheNo,
      amountUsd: amount,
      sentAt: d.sentAt,
      receiptStatus,
      isOverdue,
    };
  });

  return {
    agentId: id,
    agentName: agent.companyName,
    totalSentUsd,
    totalReconciledUsd,
    outstandingBalanceUsd: totalSentUsd - totalReconciledUsd,
    overdueCount: items.filter((i) => i.isOverdue).length,
    items,
  };
}

export async function getAgentTransactions(
  id: string,
  _actor: AuthenticatedUser,
  query: { page?: number; limit?: number },
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw new NotFoundError('Agent not found');

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { agentId: id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.transaction.count({ where: { agentId: id } }),
  ]);

  return { transactions, total, page, limit };
}
