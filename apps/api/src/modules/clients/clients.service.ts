import { prisma } from '@aop/db';
import { NotFoundError, ForbiddenError } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import type { Prisma } from '@aop/db';
import type { CreateClientInput, UpdateClientInput, ListClientsQuery } from './clients.schemas.js';

// ---------------------------------------------------------------------------
// Agent data scoping
// ---------------------------------------------------------------------------

function agentScope(user: AuthenticatedUser): Prisma.ClientWhereInput {
  if (user.role === 'OPERATIONS' && user.agentId) {
    return { assignedAgentId: user.agentId };
  }
  return {};
}

async function assertClientAccess(clientId: string, user: AuthenticatedUser) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new NotFoundError('Client', clientId);
  if (user.role === 'OPERATIONS' && user.agentId && client.assignedAgentId !== user.agentId) {
    throw new ForbiddenError('You do not have access to this client');
  }
  return client;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createClient(dto: CreateClientInput, actor: AuthenticatedUser) {
  // OPERATIONS (agent) can only create for their own agentId
  if (actor.role === 'OPERATIONS' && actor.agentId) {
    if (dto.assignedAgentId && dto.assignedAgentId !== actor.agentId) {
      throw new ForbiddenError('Agents can only create clients assigned to themselves');
    }
    dto = { ...dto, assignedAgentId: actor.agentId };
  }

  return prisma.client.create({ data: dto });
}

export async function listClients(query: ListClientsQuery, actor: AuthenticatedUser) {
  const { page, limit, kycStatus, sanctionsStatus, entityType, countryCode, search, agentId } =
    query;

  const where: Prisma.ClientWhereInput = {
    ...agentScope(actor),
    ...(kycStatus && { kycStatus }),
    ...(sanctionsStatus && { sanctionsStatus }),
    ...(entityType && { entityType }),
    ...(countryCode && { countryCode }),
    ...(agentId && { assignedAgentId: agentId }),
    ...(search && { fullName: { contains: search, mode: 'insensitive' } }),
  };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { assignedAgent: { select: { id: true, companyName: true } } },
    }),
    prisma.client.count({ where }),
  ]);

  return { clients, total, page, limit };
}

export async function getClientById(clientId: string, actor: AuthenticatedUser) {
  const client = await assertClientAccess(clientId, actor);

  const [kycRecords, latestScreening, transactionCount] = await Promise.all([
    prisma.kycRecord.findMany({
      where: { clientId },
      orderBy: { uploadedAt: 'desc' },
    }),
    prisma.sanctionsScreening.findFirst({
      where: { clientId },
      orderBy: { screenedAt: 'desc' },
    }),
    prisma.transaction.count({ where: { clientId } }),
  ]);

  return { ...client, kycRecords, latestScreening, transactionCount };
}

export async function updateClient(
  clientId: string,
  dto: UpdateClientInput,
  actor: AuthenticatedUser,
) {
  await assertClientAccess(clientId, actor);
  return prisma.client.update({ where: { id: clientId }, data: dto });
}

export async function getClientTransactions(
  clientId: string,
  actor: AuthenticatedUser,
  page = 1,
  limit = 20,
) {
  await assertClientAccess(clientId, actor);

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { clientId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phase: true,
        status: true,
        goldWeightGross: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.transaction.count({ where: { clientId } }),
  ]);

  return { transactions, total, page, limit };
}

export async function getClientScreenings(clientId: string, actor: AuthenticatedUser) {
  await assertClientAccess(clientId, actor);
  return prisma.sanctionsScreening.findMany({
    where: { clientId },
    orderBy: { screenedAt: 'desc' },
    include: { screenedByUser: { select: { id: true, email: true } } },
  });
}

export async function setEddFlag(clientId: string, value: boolean, actor: AuthenticatedUser) {
  await assertClientAccess(clientId, actor);
  return prisma.client.update({ where: { id: clientId }, data: { isEDD: value } });
}

export async function setPepFlag(clientId: string, value: boolean, actor: AuthenticatedUser) {
  await assertClientAccess(clientId, actor);
  return prisma.client.update({ where: { id: clientId }, data: { isPEP: value } });
}
