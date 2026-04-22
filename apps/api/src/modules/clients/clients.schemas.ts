import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums (mirroring Prisma enums to avoid importing from @prisma/client in tests)
// ---------------------------------------------------------------------------

export const EntityTypeEnum = z.enum(['INDIVIDUAL', 'COMPANY', 'COOP']);
export const KycStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
export const SanctionsStatusEnum = z.enum(['CLEAR', 'HIT', 'POSSIBLE_MATCH', 'PENDING']);
export const RiskRatingEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']);
export const KycDocumentTypeEnum = z.enum([
  'NATIONAL_ID',
  'PASSPORT',
  'DRIVING_LICENCE',
  'UTILITY_BILL',
  'BANK_STATEMENT',
  'MINING_LICENCE',
  'BUSINESS_REGISTRATION',
  'TAX_CERTIFICATE',
  'COMPANY_CONSTITUTION',
  'DIRECTOR_ID',
  'BENEFICIAL_OWNER_DECLARATION',
  'SOURCE_OF_FUNDS',
  'PROOF_OF_ADDRESS',
  'SANCTIONS_CHECK_REPORT',
  'OTHER',
]);

// ---------------------------------------------------------------------------
// Client CRUD
// ---------------------------------------------------------------------------

export const CreateClientSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  entityType: EntityTypeEnum,
  countryCode: z.string().length(2, 'Country code must be 2 characters').toUpperCase(),
  nationalId: z.string().optional(),
  miningLicenceNo: z.string().optional(),
  businessRegNo: z.string().optional(),
  assignedAgentId: z.string().optional(),
  riskRating: RiskRatingEnum.optional(),
});

export const UpdateClientSchema = CreateClientSchema.partial();

export const ListClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kycStatus: KycStatusEnum.optional(),
  sanctionsStatus: SanctionsStatusEnum.optional(),
  entityType: EntityTypeEnum.optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  search: z.string().optional(),
  agentId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// KYC documents
// ---------------------------------------------------------------------------

export const UploadKycDocSchema = z.object({
  documentType: KycDocumentTypeEnum,
});

export const RejectKycDocSchema = z.object({
  reason: z.string().min(5, 'Rejection reason must be at least 5 characters'),
});

export const RejectKycSchema = z.object({
  reason: z.string().min(5, 'Rejection reason must be at least 5 characters'),
});

// ---------------------------------------------------------------------------
// Sanctions screening
// ---------------------------------------------------------------------------

export const ManualScreeningSchema = z.object({
  outcome: z.enum(['CLEAR', 'HIT', 'POSSIBLE_MATCH']),
  note: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

export const SetFlagSchema = z.object({
  value: z.boolean(),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
export type ListClientsQuery = z.infer<typeof ListClientsQuerySchema>;
export type UploadKycDocInput = z.infer<typeof UploadKycDocSchema>;
export type RejectKycDocInput = z.infer<typeof RejectKycDocSchema>;
export type RejectKycInput = z.infer<typeof RejectKycSchema>;
export type SetFlagInput = z.infer<typeof SetFlagSchema>;
export type ManualScreeningInput = z.infer<typeof ManualScreeningSchema>;
