import { z } from 'zod';

export const CostCategoryEnum = z.enum([
  'REFINING_CHARGE',
  'ASSAY_FEE',
  'EXPORT_LEVY',
  'CUSTOMS_DUTY',
  'FREIGHT',
  'INSURANCE',
  'BANK_CHARGES',
  'AGENT_COMMISSION',
  'LABORATORY_FEE',
  'REGULATORY_FEE',
  'MISCELLANEOUS',
]);

export const AddCostItemSchema = z
  .object({
    category: CostCategoryEnum,
    estimatedUsd: z.number().positive().optional(),
    actualUsd: z.number().positive().optional(),
    currencyOriginal: z.string().length(3).toUpperCase().optional(),
    amountOriginal: z.number().positive().optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (d) => d.estimatedUsd != null || d.actualUsd != null,
    'At least one of estimatedUsd or actualUsd is required',
  );

export const UpdateCostItemSchema = z.object({
  category: CostCategoryEnum.optional(),
  estimatedUsd: z.number().positive().optional(),
  actualUsd: z.number().positive().optional(),
  currencyOriginal: z.string().length(3).toUpperCase().optional(),
  amountOriginal: z.number().positive().optional(),
  notes: z.string().max(1000).optional(),
});

export const RejectEstimateSchema = z.object({
  reason: z.string().min(5).max(2000),
});

export const RequestDisbursementSchema = z.object({
  amountUsd: z.number().positive(),
  bankRef: z.string().max(100).optional(),
});

export const QueryReceiptSchema = z.object({
  note: z.string().min(1).max(2000),
});

export const PortfolioPnlQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  agentId: z.string().optional(),
});

export type AddCostItemDto = z.infer<typeof AddCostItemSchema>;
export type UpdateCostItemDto = z.infer<typeof UpdateCostItemSchema>;
export type RejectEstimateDto = z.infer<typeof RejectEstimateSchema>;
export type RequestDisbursementDto = z.infer<typeof RequestDisbursementSchema>;
export type QueryReceiptDto = z.infer<typeof QueryReceiptSchema>;
export type PortfolioPnlQuery = z.infer<typeof PortfolioPnlQuerySchema>;
