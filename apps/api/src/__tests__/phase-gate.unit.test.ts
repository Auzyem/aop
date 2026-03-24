/**
 * Unit tests for PhaseGateService pure functions.
 * All functions are pure (no I/O) — no mocks required.
 * Covers: checkPhaseGate, nextPhaseState, computeRag, EXPORT_DOC_TYPES.
 */

import {
  checkPhaseGate,
  nextPhaseState,
  computeRag,
  SLA_TARGETS_DAYS,
  EXPORT_DOC_TYPES,
  type GateContext,
} from '../modules/transactions/phase-gate.service';

// ── Helper builders ───────────────────────────────────────────────────────────

function approvedDoc(documentType: string) {
  return { documentType, approvalStatus: 'APPROVED' };
}

function pendingDoc(documentType: string) {
  return { documentType, approvalStatus: 'PENDING' };
}

/** Build a fully-passing context for a given phase */
function baseCtx(phase: string, status = 'IN_PROGRESS'): GateContext {
  return {
    transaction: {
      phase,
      status,
      goldWeightFine: 1000,
      assayPurity: 99.5,
      lmePriceLocked: 2_350,
      priceLockedAt: new Date(),
    },
    clientKycStatus: 'APPROVED',
    documents: [
      approvedDoc('BANK_INSTRUCTION_LETTER'),
      approvedDoc('REGULATORY_FILING'),
      approvedDoc('ASSAY_CERTIFICATE'),
      approvedDoc('PACKING_LIST'),
      approvedDoc('MINING_LICENCE'),
      approvedDoc('EXPORT_PERMIT'),
      approvedDoc('COMMERCIAL_INVOICE'),
      approvedDoc('BILL_OF_LADING'),
      approvedDoc('CERTIFICATE_OF_ORIGIN'),
      approvedDoc('CUSTOMS_DECLARATION'),
      approvedDoc('INSURANCE_CERTIFICATE'),
      approvedDoc('SETTLEMENT_STATEMENT'),
      approvedDoc('AML_SCREENING_REPORT'),
    ],
    costItems: [{ estimatedUsd: 1_000 }],
    disbursements: [{ trancheNo: 1, status: 'SENT' }],
    settlement: { remittanceStatus: 'SENT' },
    hasRegulatoryReport: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 1 → 2
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPhaseGate — PHASE_1 → PHASE_2', () => {
  it('returns canAdvance=true when all conditions met', () => {
    const result = checkPhaseGate(baseCtx('PHASE_1'));
    expect(result.canAdvance).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks when clientKycStatus is not APPROVED', () => {
    const ctx = baseCtx('PHASE_1');
    ctx.clientKycStatus = 'PENDING';
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('KYC status must be APPROVED'))).toBe(true);
  });

  it('blocks when BANK_INSTRUCTION_LETTER is missing', () => {
    const ctx = baseCtx('PHASE_1');
    ctx.documents = ctx.documents.filter((d) => d.documentType !== 'BANK_INSTRUCTION_LETTER');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Master Client Agreement'))).toBe(true);
  });

  it('blocks when BANK_INSTRUCTION_LETTER is PENDING (not APPROVED)', () => {
    const ctx = baseCtx('PHASE_1');
    const idx = ctx.documents.findIndex((d) => d.documentType === 'BANK_INSTRUCTION_LETTER');
    ctx.documents[idx] = pendingDoc('BANK_INSTRUCTION_LETTER');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Master Client Agreement'))).toBe(true);
  });

  it('blocks when REGULATORY_FILING is missing', () => {
    const ctx = baseCtx('PHASE_1');
    ctx.documents = ctx.documents.filter((d) => d.documentType !== 'REGULATORY_FILING');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Power of Attorney'))).toBe(true);
  });

  it('accumulates multiple blockers simultaneously', () => {
    const ctx = baseCtx('PHASE_1');
    ctx.clientKycStatus = 'REJECTED';
    ctx.documents = [];
    const result = checkPhaseGate(ctx);
    expect(result.blockers.length).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE 2 → 3
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPhaseGate — PHASE_2 → PHASE_3', () => {
  it('returns canAdvance=true when all conditions met', () => {
    const result = checkPhaseGate(baseCtx('PHASE_2'));
    expect(result.canAdvance).toBe(true);
  });

  it('blocks when ASSAY_CERTIFICATE is missing', () => {
    const ctx = baseCtx('PHASE_2');
    ctx.documents = ctx.documents.filter((d) => d.documentType !== 'ASSAY_CERTIFICATE');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Certificate of Assay'))).toBe(true);
  });

  it('blocks when goldWeightFine is null', () => {
    const ctx = baseCtx('PHASE_2');
    ctx.transaction.goldWeightFine = null;
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Gold weight fine'))).toBe(true);
  });

  it('blocks when goldWeightFine is zero', () => {
    const ctx = baseCtx('PHASE_2');
    ctx.transaction.goldWeightFine = 0;
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Gold weight fine'))).toBe(true);
  });

  it('blocks when assayPurity is null', () => {
    const ctx = baseCtx('PHASE_2');
    ctx.transaction.assayPurity = null;
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Assay purity'))).toBe(true);
  });

  it('blocks when PACKING_LIST is missing', () => {
    const ctx = baseCtx('PHASE_2');
    ctx.documents = ctx.documents.filter((d) => d.documentType !== 'PACKING_LIST');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Consignment Acceptance Form'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE 3 → 4
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPhaseGate — PHASE_3 → PHASE_4', () => {
  it('returns canAdvance=true when cost estimate exists and Tranche 1 is SENT', () => {
    const result = checkPhaseGate(baseCtx('PHASE_3'));
    expect(result.canAdvance).toBe(true);
  });

  it('blocks when no cost estimates exist', () => {
    const ctx = baseCtx('PHASE_3');
    ctx.costItems = [];
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('cost estimate'))).toBe(true);
  });

  it('blocks when cost estimates are all null', () => {
    const ctx = baseCtx('PHASE_3');
    ctx.costItems = [{ estimatedUsd: null }];
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('cost estimate'))).toBe(true);
  });

  it('blocks when cost estimates are all zero', () => {
    const ctx = baseCtx('PHASE_3');
    ctx.costItems = [{ estimatedUsd: 0 }];
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('cost estimate'))).toBe(true);
  });

  it('blocks when Tranche 1 disbursement does not exist', () => {
    const ctx = baseCtx('PHASE_3');
    ctx.disbursements = [];
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Tranche 1 has not been created'))).toBe(true);
  });

  it('blocks when Tranche 1 status is PENDING (not SENT)', () => {
    const ctx = baseCtx('PHASE_3');
    ctx.disbursements = [{ trancheNo: 1, status: 'PENDING' }];
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('must have status SENT'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE 4 → 5  (11 export docs + AML = 12 possible blockers)
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPhaseGate — PHASE_4 → PHASE_5', () => {
  it('returns canAdvance=true when all 12 documents are approved', () => {
    const result = checkPhaseGate(baseCtx('PHASE_4'));
    expect(result.canAdvance).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  // Test each of the 11 export doc types individually
  for (const docType of EXPORT_DOC_TYPES) {
    it(`blocks when ${docType} is missing`, () => {
      const ctx = baseCtx('PHASE_4');
      ctx.documents = ctx.documents.filter((d) => d.documentType !== docType);
      const result = checkPhaseGate(ctx);
      expect(result.canAdvance).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
    });
  }

  it('blocks when AML_SCREENING_REPORT is missing', () => {
    const ctx = baseCtx('PHASE_4');
    ctx.documents = ctx.documents.filter((d) => d.documentType !== 'AML_SCREENING_REPORT');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('AML') || b.includes('Compliance Officer'))).toBe(
      true,
    );
  });

  it('reports all 12 blockers when no documents are present', () => {
    const ctx = baseCtx('PHASE_4');
    ctx.documents = [];
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    // 11 EXPORT_DOC_TYPES + 1 AML_SCREENING_REPORT
    expect(result.blockers).toHaveLength(12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE 5 → 6
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPhaseGate — PHASE_5 → PHASE_6', () => {
  it('returns canAdvance=true when BILL_OF_LADING is approved', () => {
    const result = checkPhaseGate(baseCtx('PHASE_5'));
    expect(result.canAdvance).toBe(true);
  });

  it('blocks when BILL_OF_LADING is missing', () => {
    const ctx = baseCtx('PHASE_5');
    ctx.documents = ctx.documents.filter((d) => d.documentType !== 'BILL_OF_LADING');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(
      result.blockers.some((b) => b.includes('Bill of Lading') || b.includes('Airway Bill')),
    ).toBe(true);
  });

  it('blocks when BILL_OF_LADING is not approved', () => {
    const ctx = baseCtx('PHASE_5');
    const idx = ctx.documents.findIndex((d) => d.documentType === 'BILL_OF_LADING');
    ctx.documents[idx] = pendingDoc('BILL_OF_LADING');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE 6 → 6b  (status !== SETTLEMENT_PENDING)
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPhaseGate — PHASE_6 gate 6→6b (status ≠ SETTLEMENT_PENDING)', () => {
  it('returns canAdvance=true when all conditions met', () => {
    const ctx = baseCtx('PHASE_6', 'PRICE_LOCKED');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(true);
  });

  it('blocks when SETTLEMENT_STATEMENT is missing', () => {
    const ctx = baseCtx('PHASE_6', 'PRICE_LOCKED');
    ctx.documents = ctx.documents.filter((d) => d.documentType !== 'SETTLEMENT_STATEMENT');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Final Sale Confirmation'))).toBe(true);
  });

  it('blocks when lmePriceLocked is null', () => {
    const ctx = baseCtx('PHASE_6', 'PRICE_LOCKED');
    ctx.transaction.lmePriceLocked = null;
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('LME price must be locked'))).toBe(true);
  });

  it('blocks when lmePriceLocked is zero', () => {
    const ctx = baseCtx('PHASE_6', 'PRICE_LOCKED');
    ctx.transaction.lmePriceLocked = 0;
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('LME price must be locked'))).toBe(true);
  });

  it('blocks when priceLockedAt is null', () => {
    const ctx = baseCtx('PHASE_6', 'PRICE_LOCKED');
    ctx.transaction.priceLockedAt = null;
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Price lock date'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE 6b → 7  (status === SETTLEMENT_PENDING)
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPhaseGate — PHASE_6 gate 6b→7 (status = SETTLEMENT_PENDING)', () => {
  it('returns canAdvance=true when settlement is SENT and regulatory report exists', () => {
    const ctx = baseCtx('PHASE_6', 'SETTLEMENT_PENDING');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(true);
  });

  it('returns canAdvance=true when settlement remittanceStatus is CONFIRMED', () => {
    const ctx = baseCtx('PHASE_6', 'SETTLEMENT_PENDING');
    ctx.settlement = { remittanceStatus: 'CONFIRMED' };
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(true);
  });

  it('blocks when settlement record does not exist', () => {
    const ctx = baseCtx('PHASE_6', 'SETTLEMENT_PENDING');
    ctx.settlement = null;
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Settlement record has not been created'))).toBe(
      true,
    );
  });

  it('blocks when settlement remittanceStatus is PENDING', () => {
    const ctx = baseCtx('PHASE_6', 'SETTLEMENT_PENDING');
    ctx.settlement = { remittanceStatus: 'PENDING' };
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('SENT or CONFIRMED'))).toBe(true);
  });

  it('blocks when hasRegulatoryReport is false', () => {
    const ctx = baseCtx('PHASE_6', 'SETTLEMENT_PENDING');
    ctx.hasRegulatoryReport = false;
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('regulatory report'))).toBe(true);
  });

  it('accumulates both blockers when settlement missing and no regulatory report', () => {
    const ctx = baseCtx('PHASE_6', 'SETTLEMENT_PENDING');
    ctx.settlement = null;
    ctx.hasRegulatoryReport = false;
    const result = checkPhaseGate(ctx);
    expect(result.blockers).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE_7 (final phase — already complete)
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPhaseGate — PHASE_7 (already final)', () => {
  it('returns canAdvance=false with final-phase blocker', () => {
    const result = checkPhaseGate(baseCtx('PHASE_7'));
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('final phase'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Unknown phase
// ═══════════════════════════════════════════════════════════════════════════

describe('checkPhaseGate — unknown phase', () => {
  it('returns canAdvance=false with unknown-phase blocker', () => {
    const ctx = baseCtx('PHASE_9');
    const result = checkPhaseGate(ctx);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.some((b) => b.includes('Unknown phase'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// nextPhaseState
// ═══════════════════════════════════════════════════════════════════════════

describe('nextPhaseState', () => {
  it('PHASE_1 → PHASE_2 with ASSAY_IN_PROGRESS status', () => {
    const result = nextPhaseState('PHASE_1', 'IN_PROGRESS');
    expect(result.phase).toBe('PHASE_2');
    expect(result.status).toBe('ASSAY_IN_PROGRESS');
  });

  it('PHASE_2 → PHASE_3 with LOGISTICS_PENDING status', () => {
    const result = nextPhaseState('PHASE_2', 'ASSAY_IN_PROGRESS');
    expect(result.phase).toBe('PHASE_3');
    expect(result.status).toBe('LOGISTICS_PENDING');
  });

  it('PHASE_3 → PHASE_4 with RECEIVED_AT_REFINERY status', () => {
    const result = nextPhaseState('PHASE_3', 'LOGISTICS_PENDING');
    expect(result.phase).toBe('PHASE_4');
    expect(result.status).toBe('RECEIVED_AT_REFINERY');
  });

  it('PHASE_4 → PHASE_5 with DISBURSEMENT_PENDING status', () => {
    const result = nextPhaseState('PHASE_4', 'RECEIVED_AT_REFINERY');
    expect(result.phase).toBe('PHASE_5');
    expect(result.status).toBe('DISBURSEMENT_PENDING');
  });

  it('PHASE_5 → PHASE_6 with PRICE_LOCKED status', () => {
    const result = nextPhaseState('PHASE_5', 'DISBURSEMENT_PENDING');
    expect(result.phase).toBe('PHASE_6');
    expect(result.status).toBe('PRICE_LOCKED');
  });

  it('PHASE_6 (non-SETTLEMENT_PENDING) → stays PHASE_6 with SETTLEMENT_PENDING', () => {
    const result = nextPhaseState('PHASE_6', 'PRICE_LOCKED');
    expect(result.phase).toBe('PHASE_6');
    expect(result.status).toBe('SETTLEMENT_PENDING');
  });

  it('PHASE_6 SETTLEMENT_PENDING → PHASE_7 with SETTLED status', () => {
    const result = nextPhaseState('PHASE_6', 'SETTLEMENT_PENDING');
    expect(result.phase).toBe('PHASE_7');
    expect(result.status).toBe('SETTLED');
  });

  it('throws when attempting to advance beyond PHASE_7', () => {
    expect(() => nextPhaseState('PHASE_7', 'SETTLED')).toThrow();
  });

  it('throws for unknown phase', () => {
    expect(() => nextPhaseState('PHASE_99', 'ANYTHING')).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// computeRag
// ═══════════════════════════════════════════════════════════════════════════

describe('computeRag', () => {
  it('returns GREEN when less than 70% of SLA target elapsed', () => {
    // PHASE_1 SLA = 3 days; <70% = <2.1 days = 1 day elapsed = GREEN
    const enteredAt = new Date(Date.now() - 1 * 86_400_000); // 1 day ago
    expect(computeRag('PHASE_1', enteredAt)).toBe('GREEN');
  });

  it('returns AMBER when between 70% and 100% of SLA target elapsed', () => {
    // PHASE_1 SLA = 3 days; 80% = 2.4 days ago
    const enteredAt = new Date(Date.now() - 2.4 * 86_400_000);
    expect(computeRag('PHASE_1', enteredAt)).toBe('AMBER');
  });

  it('returns RED when SLA target is exceeded', () => {
    // PHASE_1 SLA = 3 days; 4 days elapsed = RED
    const enteredAt = new Date(Date.now() - 4 * 86_400_000);
    expect(computeRag('PHASE_1', enteredAt)).toBe('RED');
  });

  it('returns GREEN for unknown phase (no target defined)', () => {
    const enteredAt = new Date(Date.now() - 365 * 86_400_000);
    expect(computeRag('PHASE_99', enteredAt)).toBe('GREEN');
  });

  it('checks all known phases have SLA targets defined', () => {
    const knownPhases = [
      'PHASE_1',
      'PHASE_2',
      'PHASE_3',
      'PHASE_4',
      'PHASE_5',
      'PHASE_6',
      'PHASE_7',
    ];
    for (const phase of knownPhases) {
      expect(SLA_TARGETS_DAYS[phase]).toBeGreaterThan(0);
    }
  });

  it('PHASE_2 SLA is 5 days — AMBER at 4 days', () => {
    const enteredAt = new Date(Date.now() - 4 * 86_400_000);
    expect(computeRag('PHASE_2', enteredAt)).toBe('AMBER');
  });

  it('PHASE_5 SLA is 7 days — RED at 8 days', () => {
    const enteredAt = new Date(Date.now() - 8 * 86_400_000);
    expect(computeRag('PHASE_5', enteredAt)).toBe('RED');
  });
});
