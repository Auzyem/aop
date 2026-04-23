import { z } from 'zod';
import { StrongPasswordSchema } from '../../auth/auth.schemas.js';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: StrongPasswordSchema,
  role: z.enum([
    'SUPER_ADMIN',
    'ADMIN',
    'COMPLIANCE_OFFICER',
    'TRADE_MANAGER',
    'OPERATIONS',
    'VIEWER',
  ]),
  countryCode: z.string().length(2),
  agentId: z.string().optional(),
});

export const UpdateUserSchema = z.object({
  role: z
    .enum(['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER', 'OPERATIONS', 'VIEWER'])
    .optional(),
  countryCode: z.string().length(2).optional(),
  isActive: z.boolean().optional(),
  agentId: z.string().nullable().optional(),
});

export const CreateAgentSchema = z.object({
  companyName: z.string().min(1),
  countryCode: z.string().length(2),
  contactName: z.string().min(1),
  contactEmail: z.preprocess((v) => (v === '' ? undefined : v), z.string().email().optional()),
  licenceNo: z.string().min(1),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  swiftBic: z.string().optional(),
});

export const UpdateAgentSchema = CreateAgentSchema.partial();

export const UpdateSettingSchema = z.object({
  value: z.unknown(),
});

export const AuditLogQuerySchema = z.object({
  userId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ListUsersQuerySchema = z.object({
  role: z
    .enum(['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER', 'OPERATIONS', 'VIEWER'])
    .optional(),
  country: z.string().length(2).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ListAgentsQuerySchema = z.object({
  country: z.string().length(2).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export type CreateAgentDto = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentDto = z.infer<typeof UpdateAgentSchema>;
export type UpdateSettingDto = z.infer<typeof UpdateSettingSchema>;
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;

// ---------------------------------------------------------------------------
// GDPR / POPIA data management
// ---------------------------------------------------------------------------

export const ExportSubjectDataSchema = z.object({
  clientId: z.string().min(1),
});

export const DeletionRequestSchema = z.object({
  clientId: z.string().min(1),
  reason: z.string().min(10, 'Please provide a reason of at least 10 characters'),
});

export type ExportSubjectDataDto = z.infer<typeof ExportSubjectDataSchema>;
export type DeletionRequestDto = z.infer<typeof DeletionRequestSchema>;
