import { z } from 'zod';

export const GenerateReportSchema = z.object({
  reportType: z.enum([
    'MONTHLY_TRANSACTION',
    'OECD_DUE_DILIGENCE',
    'CLIENT_KYC_STATUS',
    'STR_DRAFT',
    'PORTFOLIO_SUMMARY',
    'POST_TRANSACTION_AUDIT',
  ]),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  transactionId: z.string().optional(), // for POST_TRANSACTION_AUDIT
  clientId: z.string().optional(), // for CLIENT_KYC_STATUS
  notes: z.string().optional(),
});

export const UpdateScheduleSchema = z.object({
  reportType: z.string(),
  cronExpression: z.string(),
  recipients: z.array(z.string().email()),
  enabled: z.boolean().optional(),
});

export type GenerateReportInput = z.infer<typeof GenerateReportSchema>;
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleSchema>;
