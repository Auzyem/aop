import { prisma } from '@aop/db';
import { NotFoundError } from '@aop/utils';
import type { CreateRefineryDto, UpdateRefineryDto } from './lme.schemas.js';

export async function listRefineries() {
  return prisma.refinery.findMany({ orderBy: { name: 'asc' } });
}

export async function createRefinery(dto: CreateRefineryDto) {
  return prisma.refinery.create({
    data: {
      name: dto.name,
      countryCode: dto.countryCode,
      lbmaAccredited: dto.lbmaAccredited,
      contactEmail: dto.contactEmail,
      refiningChargePercent: dto.refiningChargePercent / 100, // input is % → store as fraction
      assayFeeUsd: dto.assayFeeUsd,
    },
  });
}

export async function updateRefinery(id: string, dto: UpdateRefineryDto) {
  const refinery = await prisma.refinery.findUnique({ where: { id } });
  if (!refinery) throw new NotFoundError('Refinery not found');

  return prisma.refinery.update({
    where: { id },
    data: {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
      ...(dto.lbmaAccredited !== undefined ? { lbmaAccredited: dto.lbmaAccredited } : {}),
      ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
      ...(dto.refiningChargePercent !== undefined
        ? { refiningChargePercent: dto.refiningChargePercent / 100 }
        : {}),
      ...(dto.assayFeeUsd !== undefined ? { assayFeeUsd: dto.assayFeeUsd } : {}),
    },
  });
}
