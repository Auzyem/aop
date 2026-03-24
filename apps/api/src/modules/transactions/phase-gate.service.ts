// ---------------------------------------------------------------------------
// Phase Gate Service
//
// Pure functions — no database access. Accepts a GateContext (pre-fetched data)
// and returns { canAdvance, blockers } for the current phase transition.
//
// Document type mapping (schema enum → business requirement):
//   BANK_INSTRUCTION_LETTER  → Master Client Agreement
//   REGULATORY_FILING        → Power of Attorney
//   ASSAY_CERTIFICATE        → Certificate of Assay (origin)
//   PACKING_LIST             → Consignment Acceptance Form
//   AML_SCREENING_REPORT     → Compliance Officer sign-off
//   SETTLEMENT_STATEMENT     → Final Sale Confirmation
//   BILL_OF_LADING           → Airway Bill / Bill of Lading
//
// Phase 6 split:
//   PHASE_6 + status != SETTLEMENT_PENDING  → gate 6→6b (lock price)
//   PHASE_6 + status == SETTLEMENT_PENDING  → gate 6b→7  (close out)
// ---------------------------------------------------------------------------

export interface GateResult {
  canAdvance: boolean;
  blockers: string[];
}

export interface GateContext {
  transaction: {
    phase: string;
    status: string;
    goldWeightFine: number | null;
    assayPurity: number | null;
    lmePriceLocked: number | null;
    priceLockedAt: Date | null;
  };
  /** KycStatus string value for the transaction's client */
  clientKycStatus: string;
  documents: Array<{
    documentType: string;
    approvalStatus: string;
  }>;
  costItems: Array<{ estimatedUsd: number | null }>;
  disbursements: Array<{ trancheNo: number; status: string }>;
  settlement: { remittanceStatus: string } | null;
  /** Whether a post-transaction regulatory report exists */
  hasRegulatoryReport: boolean;
}

// ---------------------------------------------------------------------------
// SLA targets (days per phase)
// ---------------------------------------------------------------------------

export const SLA_TARGETS_DAYS: Record<string, number> = {
  PHASE_1: 3,
  PHASE_2: 5,
  PHASE_3: 2,
  PHASE_4: 5,
  PHASE_5: 7,
  PHASE_6: 3,
  PHASE_7: 2,
};

export type RagStatus = 'GREEN' | 'AMBER' | 'RED';

export function computeRag(phase: string, enteredAt: Date): RagStatus {
  const targetDays = SLA_TARGETS_DAYS[phase];
  if (!targetDays) return 'GREEN';
  const elapsedDays = (Date.now() - enteredAt.getTime()) / 86_400_000;
  const ratio = elapsedDays / targetDays;
  if (ratio < 0.7) return 'GREEN';
  if (ratio <= 1.0) return 'AMBER';
  return 'RED';
}

// ---------------------------------------------------------------------------
// The 11 required export document types (Gate 4→5)
// ---------------------------------------------------------------------------

export const EXPORT_DOC_TYPES = [
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
] as const;

// Human-readable names used in blocker messages
export const DOC_LABELS: Record<string, string> = {
  BANK_INSTRUCTION_LETTER: 'Master Client Agreement',
  REGULATORY_FILING: 'Power of Attorney',
  ASSAY_CERTIFICATE: 'Certificate of Assay (origin)',
  PACKING_LIST: 'Consignment Acceptance Form',
  MINING_LICENCE: 'Mining Licence',
  EXPORT_PERMIT: 'Export Permit',
  COMMERCIAL_INVOICE: 'Commercial Invoice',
  BILL_OF_LADING: 'Airway Bill / Bill of Lading',
  CERTIFICATE_OF_ORIGIN: 'Certificate of Origin',
  CUSTOMS_DECLARATION: 'Customs Declaration',
  INSURANCE_CERTIFICATE: 'Insurance Certificate',
  SETTLEMENT_STATEMENT: 'Final Sale Confirmation',
  AML_SCREENING_REPORT: 'Compliance Officer Sign-Off (AML Report)',
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function hasApprovedDoc(docs: GateContext['documents'], docType: string): boolean {
  return docs.some((d) => d.documentType === docType && d.approvalStatus === 'APPROVED');
}

// ---------------------------------------------------------------------------
// Individual gate checks
// ---------------------------------------------------------------------------

function checkGate1to2(ctx: GateContext): GateResult {
  const blockers: string[] = [];

  if (ctx.clientKycStatus !== 'APPROVED') {
    blockers.push('Client KYC status must be APPROVED before advancing to Phase 2');
  }
  if (!hasApprovedDoc(ctx.documents, 'BANK_INSTRUCTION_LETTER')) {
    blockers.push('Master Client Agreement must be uploaded and approved');
  }
  if (!hasApprovedDoc(ctx.documents, 'REGULATORY_FILING')) {
    blockers.push('Power of Attorney must be uploaded and approved');
  }

  return { canAdvance: blockers.length === 0, blockers };
}

function checkGate2to3(ctx: GateContext): GateResult {
  const blockers: string[] = [];

  if (!hasApprovedDoc(ctx.documents, 'ASSAY_CERTIFICATE')) {
    blockers.push('Certificate of Assay (origin) must be uploaded and approved');
  }
  if (ctx.transaction.goldWeightFine === null || ctx.transaction.goldWeightFine <= 0) {
    blockers.push('Gold weight fine (post-assay, grams) must be recorded and greater than zero');
  }
  if (ctx.transaction.assayPurity === null) {
    blockers.push('Assay purity must be recorded on the transaction');
  }
  if (!hasApprovedDoc(ctx.documents, 'PACKING_LIST')) {
    blockers.push('Consignment Acceptance Form must be uploaded and approved');
  }

  return { canAdvance: blockers.length === 0, blockers };
}

function checkGate3to4(ctx: GateContext): GateResult {
  const blockers: string[] = [];

  const hasCostEstimate = ctx.costItems.some((c) => c.estimatedUsd !== null && c.estimatedUsd > 0);
  if (!hasCostEstimate) {
    blockers.push('At least one cost estimate must be entered for this transaction');
  }

  const tranche1 = ctx.disbursements.find((d) => d.trancheNo === 1);
  if (!tranche1) {
    blockers.push('Disbursement Tranche 1 has not been created');
  } else if (tranche1.status !== 'SENT') {
    blockers.push(`Disbursement Tranche 1 must have status SENT (current: ${tranche1.status})`);
  }

  return { canAdvance: blockers.length === 0, blockers };
}

function checkGate4to5(ctx: GateContext): GateResult {
  const blockers: string[] = [];

  for (const docType of EXPORT_DOC_TYPES) {
    if (!hasApprovedDoc(ctx.documents, docType)) {
      blockers.push(`${DOC_LABELS[docType] ?? docType} must be uploaded and approved`);
    }
  }

  if (!hasApprovedDoc(ctx.documents, 'AML_SCREENING_REPORT')) {
    blockers.push('Compliance Officer sign-off (AML Screening Report) must be approved');
  }

  return { canAdvance: blockers.length === 0, blockers };
}

function checkGate5to6(ctx: GateContext): GateResult {
  const blockers: string[] = [];

  if (!hasApprovedDoc(ctx.documents, 'BILL_OF_LADING')) {
    blockers.push('Airway Bill or Bill of Lading must be uploaded and approved');
  }

  return { canAdvance: blockers.length === 0, blockers };
}

function checkGate6to6b(ctx: GateContext): GateResult {
  const blockers: string[] = [];

  if (!hasApprovedDoc(ctx.documents, 'SETTLEMENT_STATEMENT')) {
    blockers.push('Final Sale Confirmation document must be uploaded and approved');
  }
  if (ctx.transaction.lmePriceLocked === null || ctx.transaction.lmePriceLocked <= 0) {
    blockers.push('LME price must be locked on the transaction before moving to settlement');
  }
  if (!ctx.transaction.priceLockedAt) {
    blockers.push('Price lock date/time must be recorded on the transaction');
  }

  return { canAdvance: blockers.length === 0, blockers };
}

function checkGate6bto7(ctx: GateContext): GateResult {
  const blockers: string[] = [];

  if (!ctx.settlement) {
    blockers.push('Settlement record has not been created for this transaction');
  } else if (!['SENT', 'CONFIRMED'].includes(ctx.settlement.remittanceStatus)) {
    blockers.push(
      `Settlement remittance must be SENT or CONFIRMED (current: ${ctx.settlement.remittanceStatus})`,
    );
  }

  if (!ctx.hasRegulatoryReport) {
    blockers.push('A post-transaction regulatory report must be created before closing the file');
  }

  return { canAdvance: blockers.length === 0, blockers };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Returns the gate result for the current phase (and sub-state within Phase 6).
 * Determines WHICH gate to check based on context.transaction.phase/status.
 */
export function checkPhaseGate(ctx: GateContext): GateResult {
  const { phase, status } = ctx.transaction;

  if (phase === 'PHASE_6') {
    return status === 'SETTLEMENT_PENDING' ? checkGate6bto7(ctx) : checkGate6to6b(ctx);
  }

  const gateMap: Record<string, (c: GateContext) => GateResult> = {
    PHASE_1: checkGate1to2,
    PHASE_2: checkGate2to3,
    PHASE_3: checkGate3to4,
    PHASE_4: checkGate4to5,
    PHASE_5: checkGate5to6,
    PHASE_7: () => ({
      canAdvance: false,
      blockers: ['Transaction is already in the final phase (PHASE_7)'],
    }),
  };

  const checker = gateMap[phase];
  if (!checker) {
    return { canAdvance: false, blockers: [`Unknown phase: ${phase}`] };
  }
  return checker(ctx);
}

// ---------------------------------------------------------------------------
// Phase advancement helper
// ---------------------------------------------------------------------------

/**
 * Returns the next { phase, status } for a transaction.
 * Phase 6 has a two-step advance: first to SETTLEMENT_PENDING status (phase unchanged),
 * then to PHASE_7 on the second advance call.
 */
export function nextPhaseState(
  currentPhase: string,
  currentStatus: string,
): { phase: string; status: string } {
  // Phase 6 first step: update status only
  if (currentPhase === 'PHASE_6' && currentStatus !== 'SETTLEMENT_PENDING') {
    return { phase: 'PHASE_6', status: 'SETTLEMENT_PENDING' };
  }

  const order = ['PHASE_1', 'PHASE_2', 'PHASE_3', 'PHASE_4', 'PHASE_5', 'PHASE_6', 'PHASE_7'];
  const idx = order.indexOf(currentPhase);
  if (idx === -1 || idx === order.length - 1) {
    throw new Error(`Cannot advance beyond phase ${currentPhase}`);
  }

  const next = order[idx + 1];
  const statusMap: Record<string, string> = {
    PHASE_2: 'ASSAY_IN_PROGRESS',
    PHASE_3: 'LOGISTICS_PENDING',
    PHASE_4: 'RECEIVED_AT_REFINERY',
    PHASE_5: 'DISBURSEMENT_PENDING',
    PHASE_6: 'PRICE_LOCKED',
    PHASE_7: 'SETTLED',
  };

  return { phase: next, status: statusMap[next] ?? currentStatus };
}
