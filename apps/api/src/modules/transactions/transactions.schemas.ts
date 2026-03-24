import { z } from 'zod';

export const PhaseEnum = z.enum([
  'PHASE_1',
  'PHASE_2',
  'PHASE_3',
  'PHASE_4',
  'PHASE_5',
  'PHASE_6',
  'PHASE_7',
]);

export const StatusEnum = z.enum([
  'DRAFT',
  'SUBMITTED',
  'KYC_REVIEW',
  'KYC_APPROVED',
  'KYC_REJECTED',
  'PRICE_LOCKED',
  'LOGISTICS_PENDING',
  'IN_TRANSIT',
  'RECEIVED_AT_REFINERY',
  'ASSAY_IN_PROGRESS',
  'ASSAY_COMPLETE',
  'DISBURSEMENT_PENDING',
  'PARTIALLY_DISBURSED',
  'DISBURSED',
  'SETTLEMENT_PENDING',
  'SETTLED',
  'CANCELLED',
  'ON_HOLD',
]);

export const CreateTransactionSchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  agentId: z.string().min(1, 'agentId is required'),
  countryCode: z.string().length(2, 'countryCode must be exactly 2 characters').toUpperCase(),
  goldWeightGross: z.number().positive('Gold weight must be positive'),
  assignedRefineryId: z.string().optional(),
});

export const ListTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  phase: PhaseEnum.optional(),
  status: StatusEnum.optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  agentId: z.string().optional(),
  clientId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const AdvancePhaseSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export const OverridePhaseSchema = z.object({
  reason: z.string().min(5, 'Override reason must be at least 5 characters'),
  targetPhase: PhaseEnum.optional(),
});

export const AddEventSchema = z.object({
  text: z.string().min(1).max(2000),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;
export type AdvancePhaseInput = z.infer<typeof AdvancePhaseSchema>;
export type OverridePhaseInput = z.infer<typeof OverridePhaseSchema>;
export type AddEventInput = z.infer<typeof AddEventSchema>;
