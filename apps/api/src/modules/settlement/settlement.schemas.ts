import { z } from 'zod';

export const UpdateRemittanceStatusSchema = z.object({
  status: z.enum(['INITIATED', 'SENT', 'CONFIRMED', 'FAILED']),
  bankRef: z.string().optional(),
});

export const ClearDiscrepancySchema = z.object({
  note: z.string().min(1),
});

export type UpdateRemittanceStatusDto = z.infer<typeof UpdateRemittanceStatusSchema>;
export type ClearDiscrepancyDto = z.infer<typeof ClearDiscrepancySchema>;
