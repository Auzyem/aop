import bcrypt from 'bcryptjs';
import { prisma } from '@aop/db';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '@aop/utils';
import { logger } from '@aop/utils';
import { sendMail } from '../../lib/mailer.js';
import type { AuthenticatedUser } from '@aop/types';
import type { CreateUserDto, UpdateUserDto, ListUsersQuery } from './admin.schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function omitPasswordHash<T extends { passwordHash?: string | null }>(
  user: T,
): Omit<T, 'passwordHash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, ...rest } = user;
  return rest;
}

function generateTempPassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listUsers(query: ListUsersQuery, actor: AuthenticatedUser) {
  if (actor.role === 'OPERATIONS') {
    throw new ForbiddenError('OPERATIONS role cannot access user management');
  }

  const { role, country, isActive, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (role) where.role = role;
  if (country) where.countryCode = country;
  if (isActive !== undefined) where.isActive = isActive;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { agent: { select: { id: true, companyName: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map(omitPasswordHash),
    total,
    page,
    limit,
  };
}

export async function createUser(dto: CreateUserDto, _actor: AuthenticatedUser) {
  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) {
    throw new ConflictError('Email already in use');
  }

  const passwordHash = await bcrypt.hash(dto.password, 12);

  const user = await prisma.user.create({
    data: {
      email: dto.email,
      passwordHash,
      role: dto.role,
      countryCode: dto.countryCode,
      agentId: dto.agentId ?? null,
    },
    include: { agent: { select: { id: true, companyName: true } } },
  });

  return omitPasswordHash(user);
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { agent: { select: { id: true, companyName: true } } },
  });
  if (!user) throw new NotFoundError('User not found');
  return omitPasswordHash(user);
}

export async function updateUser(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
  // Prevent self-deactivation
  if (id === actor.id && dto.isActive === false) {
    throw new ValidationError('You cannot deactivate your own account');
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('User not found');

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.countryCode !== undefined && { countryCode: dto.countryCode }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.agentId !== undefined && { agentId: dto.agentId }),
    },
    include: { agent: { select: { id: true, companyName: true } } },
  });

  return omitPasswordHash(user);
}

export async function deactivateUser(id: string, actor: AuthenticatedUser) {
  if (id === actor.id) {
    throw new ValidationError('You cannot deactivate your own account');
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('User not found');

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    include: { agent: { select: { id: true, companyName: true } } },
  });

  return omitPasswordHash(user);
}

export async function reset2fa(id: string, _actor: AuthenticatedUser): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('User not found');

  await prisma.user.update({
    where: { id },
    data: { twoFactorSecret: null },
  });
}

export async function resetPassword(id: string, _actor: AuthenticatedUser): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError('User not found');

  const tempPassword = generateTempPassword(12);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  await sendMail({
    to: user.email,
    subject: '[AOP] Your temporary password',
    text: `Your password has been reset. Your temporary password is: ${tempPassword}\n\nPlease log in and change your password immediately.`,
  });

  logger.info({ userId: id, email: user.email }, 'Password reset — temp password sent');
}
