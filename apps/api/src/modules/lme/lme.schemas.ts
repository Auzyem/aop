import { z } from 'zod';

export const PriceLockSchema = z.object({
  priceType: z.enum(['SPOT', 'AM_FIX', 'PM_FIX', 'FORWARD']),
  lockedPrice: z.number().positive(),
});

export const PriceHistoryQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  priceType: z.enum(['SPOT', 'AM_FIX', 'PM_FIX', 'FORWARD']).optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export const CreateRefinerySchema = z.object({
  name: z.string().min(1).max(200),
  countryCode: z.string().length(2).toUpperCase(),
  lbmaAccredited: z.boolean().default(false),
  contactEmail: z.string().email().optional(),
  refiningChargePercent: z.number().min(0).max(100),
  assayFeeUsd: z.number().min(0),
});

export const UpdateRefinerySchema = CreateRefinerySchema.partial();

export type PriceLockDto = z.infer<typeof PriceLockSchema>;
export type PriceHistoryQuery = z.infer<typeof PriceHistoryQuerySchema>;
export type CreateRefineryDto = z.infer<typeof CreateRefinerySchema>;
export type UpdateRefineryDto = z.infer<typeof UpdateRefinerySchema>;
