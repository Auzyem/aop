import { z } from 'zod';

export const DocumentTypeEnum = z.enum([
  'MINING_LICENCE',
  'EXPORT_PERMIT',
  'ASSAY_CERTIFICATE',
  'PACKING_LIST',
  'COMMERCIAL_INVOICE',
  'BILL_OF_LADING',
  'CERTIFICATE_OF_ORIGIN',
  'CUSTOMS_DECLARATION',
  'INSURANCE_CERTIFICATE',
  'BANK_INSTRUCTION_LETTER',
  'SETTLEMENT_STATEMENT',
  'KYC_IDENTITY_DOCUMENT',
  'AML_SCREENING_REPORT',
  'DISBURSEMENT_RECEIPT',
  'REGULATORY_FILING',
]);

export const DocumentApprovalStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED']);

export const UploadDocumentSchema = z.object({
  documentType: DocumentTypeEnum,
  transactionId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
});

export const ListDocumentsQuerySchema = z.object({
  transactionId: z.string().optional(),
  clientId: z.string().optional(),
  documentType: DocumentTypeEnum.optional(),
  approvalStatus: DocumentApprovalStatusEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const RejectDocSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export const GenerateDocSchema = z.object({
  documentType: z.enum(['COMMERCIAL_INVOICE', 'AML_COC_DECLARATION', 'FINAL_SETTLEMENT_STATEMENT']),
});

export type UploadDocumentDto = z.infer<typeof UploadDocumentSchema>;
export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuerySchema>;
export type RejectDocDto = z.infer<typeof RejectDocSchema>;
export type GenerateDocDto = z.infer<typeof GenerateDocSchema>;
