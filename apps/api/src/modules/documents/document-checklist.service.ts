import type { DocumentType, TransactionPhase } from '@aop/db';

// ---------------------------------------------------------------------------
// Required documents per phase transition (what must be present & APPROVED
// before the transaction can advance TO that phase).
// ---------------------------------------------------------------------------

export const REQUIRED_DOCS_BY_PHASE: Record<TransactionPhase, DocumentType[]> = {
  PHASE_1: [],
  PHASE_2: ['BANK_INSTRUCTION_LETTER'],
  PHASE_3: ['MINING_LICENCE', 'EXPORT_PERMIT', 'PACKING_LIST', 'INSURANCE_CERTIFICATE'],
  PHASE_4: ['ASSAY_CERTIFICATE', 'CUSTOMS_DECLARATION', 'CERTIFICATE_OF_ORIGIN'],
  PHASE_5: ['AML_SCREENING_REPORT'],
  PHASE_6: ['COMMERCIAL_INVOICE', 'SETTLEMENT_STATEMENT'],
  PHASE_7: ['REGULATORY_FILING', 'BILL_OF_LADING'],
};

export interface ChecklistItem {
  documentType: DocumentType;
  label: string;
  required: boolean;
  status: 'MISSING' | 'PENDING' | 'APPROVED' | 'REJECTED';
  documentId?: string;
}

export interface PhaseChecklist {
  phase: TransactionPhase;
  complete: boolean;
  items: ChecklistItem[];
}

const DOC_LABELS: Record<DocumentType, string> = {
  MINING_LICENCE: 'Mining Licence',
  EXPORT_PERMIT: 'Export Permit',
  ASSAY_CERTIFICATE: 'Certificate of Assay',
  PACKING_LIST: 'Consignment Acceptance Form',
  COMMERCIAL_INVOICE: 'Commercial Invoice',
  BILL_OF_LADING: 'Airway Bill / Bill of Lading',
  CERTIFICATE_OF_ORIGIN: 'Certificate of Origin',
  CUSTOMS_DECLARATION: 'Customs Declaration',
  INSURANCE_CERTIFICATE: 'Insurance Certificate',
  BANK_INSTRUCTION_LETTER: 'Master Client Agreement',
  SETTLEMENT_STATEMENT: 'Final Sale Confirmation',
  KYC_IDENTITY_DOCUMENT: 'KYC Identity Document',
  AML_SCREENING_REPORT: 'Compliance Officer Sign-off',
  DISBURSEMENT_RECEIPT: 'Disbursement Receipt',
  REGULATORY_FILING: 'Regulatory Filing',
};

export function buildChecklist(
  phase: TransactionPhase,
  uploadedDocs: Array<{ id: string; documentType: DocumentType; approvalStatus: string }>,
): PhaseChecklist {
  const required = REQUIRED_DOCS_BY_PHASE[phase] ?? [];

  // Index uploaded docs by type — latest wins (last in array)
  const byType = new Map<DocumentType, { id: string; approvalStatus: string }>();
  for (const doc of uploadedDocs) {
    byType.set(doc.documentType, { id: doc.id, approvalStatus: doc.approvalStatus });
  }

  const items: ChecklistItem[] = required.map((docType) => {
    const uploaded = byType.get(docType);
    let status: ChecklistItem['status'] = 'MISSING';
    if (uploaded) {
      if (uploaded.approvalStatus === 'APPROVED') status = 'APPROVED';
      else if (uploaded.approvalStatus === 'REJECTED') status = 'REJECTED';
      else status = 'PENDING';
    }
    return {
      documentType: docType,
      label: DOC_LABELS[docType],
      required: true,
      status,
      documentId: uploaded?.id,
    };
  });

  const complete = items.every((i) => i.status === 'APPROVED');

  return { phase, complete, items };
}
