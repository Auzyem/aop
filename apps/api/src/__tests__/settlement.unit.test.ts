/**
 * Unit tests for settlement pure functions.
 * No I/O — computeSettlement is side-effect free.
 * Target: 100% coverage on src/modules/settlement/settlement.service.ts (pure exports).
 */

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('@aop/utils', () => ({
  KG_TO_TROY_OZ: 32.1507,
  COMPANY_FEE_DEFAULT: 0.015,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundError';
    }
  },
  ValidationError: class ValidationError extends Error {
    statusCode = 400;
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    statusCode = 403;
    constructor(msg: string) {
      super(msg);
      this.name = 'ForbiddenError';
    }
  },
  ConflictError: class ConflictError extends Error {
    statusCode = 409;
    constructor(msg: string) {
      super(msg);
      this.name = 'ConflictError';
    }
  },
}));

jest.mock('@aop/db', () => ({
  prisma: {
    transaction: { findUnique: jest.fn(), update: jest.fn() },
    document: { findMany: jest.fn() },
    settlement: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({ redis: { get: jest.fn(), set: jest.fn() } }));
jest.mock('../lib/s3', () => ({
  uploadToS3: jest.fn(),
  getSignedDownloadUrl: jest.fn(),
}));
jest.mock('../lib/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../lib/fx.service', () => ({ getDailyRates: jest.fn() }));
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    }),
    close: jest.fn(),
  }),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { computeSettlement, type SettlementInput } from '../modules/settlement/settlement.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const KG_TO_TROY_OZ = 32.1507;
const COMPANY_FEE_DEFAULT = 0.015;

// ═══════════════════════════════════════════════════════════════════════════
// computeSettlement — pure unit tests
// ═══════════════════════════════════════════════════════════════════════════

describe('computeSettlement', () => {
  // ── Happy path: 2 kg fine gold @ $60,000/troy oz ─────────────────────────

  describe('happy path — 2 kg fine gold @ $60,000/troy oz', () => {
    const input: SettlementInput = {
      goldWeightFineKg: 2,
      lmePricePerTroyOz: 60_000,
      costs: [
        { actualUsd: 3_500, estimatedUsd: 4_000 }, // actualUsd wins
        { actualUsd: null, estimatedUsd: 1_200 }, // falls back to estimatedUsd
      ],
      agentDisbursementsTotal: 2_000,
      companyFeePercent: COMPANY_FEE_DEFAULT,
    };

    let result: ReturnType<typeof computeSettlement>;

    beforeAll(() => {
      result = computeSettlement(input);
    });

    it('computes fineTroyOz correctly (2 kg × 32.1507)', () => {
      const expected = 2 * KG_TO_TROY_OZ; // 64.3014
      expect(result.fineTroyOz).toBeCloseTo(expected, 4);
    });

    it('computes grossProceedsUsd to the penny', () => {
      const expected = 2 * KG_TO_TROY_OZ * 60_000; // 3,858,084
      expect(result.grossProceedsUsd).toBeCloseTo(expected, 2);
    });

    it('uses actualUsd when present, falls back to estimatedUsd', () => {
      // cost[0]: actualUsd=3500 (not 4000); cost[1]: estimatedUsd=1200
      expect(result.actualCostsUsd).toBe(4_700);
    });

    it('passes agentDisbursementsTotal through as agentFeeUsd', () => {
      expect(result.agentFeeUsd).toBe(2_000);
    });

    it('computes companyFeeUsd as 1.5% of gross', () => {
      const expectedFee = result.grossProceedsUsd * COMPANY_FEE_DEFAULT;
      expect(result.companyFeeUsd).toBeCloseTo(expectedFee, 2);
    });

    it('totalDeductionsUsd equals costs + agentFee + companyFee', () => {
      const expectedTotal = result.actualCostsUsd + result.agentFeeUsd + result.companyFeeUsd;
      expect(result.totalDeductionsUsd).toBeCloseTo(expectedTotal, 2);
    });

    it('netRemittanceUsd equals gross minus total deductions', () => {
      const expectedNet = result.grossProceedsUsd - result.totalDeductionsUsd;
      expect(result.netRemittanceUsd).toBeCloseTo(expectedNet, 2);
    });

    it('netRemittanceUsd is positive', () => {
      expect(result.netRemittanceUsd).toBeGreaterThan(0);
    });
  });

  // ── Minimum transaction: 0.5 kg ──────────────────────────────────────────

  describe('minimum transaction — 0.5 kg fine gold @ $60,000/troy oz', () => {
    it('computes correctly for 0.5 kg', () => {
      const result = computeSettlement({
        goldWeightFineKg: 0.5,
        lmePricePerTroyOz: 60_000,
        costs: [{ actualUsd: 500, estimatedUsd: null }],
        agentDisbursementsTotal: 200,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      });

      const expectedTroyOz = 0.5 * KG_TO_TROY_OZ; // 16.07535
      const expectedGross = expectedTroyOz * 60_000; // 964,521
      expect(result.fineTroyOz).toBeCloseTo(expectedTroyOz, 4);
      expect(result.grossProceedsUsd).toBeCloseTo(expectedGross, 2);
      expect(result.actualCostsUsd).toBe(500);
      expect(result.agentFeeUsd).toBe(200);
      expect(result.companyFeeUsd).toBeCloseTo(expectedGross * COMPANY_FEE_DEFAULT, 2);
    });
  });

  // ── Maximum company fee (10%) does not produce negative net ───────────────

  describe('maximum company fee — 10% should not produce negative net', () => {
    it('returns valid net when company fee is 10% with minimal costs', () => {
      const result = computeSettlement({
        goldWeightFineKg: 2,
        lmePricePerTroyOz: 60_000,
        costs: [],
        agentDisbursementsTotal: 0,
        companyFeePercent: 0.1,
      });

      const expectedGross = 2 * KG_TO_TROY_OZ * 60_000;
      const expectedFee = expectedGross * 0.1;
      expect(result.companyFeeUsd).toBeCloseTo(expectedFee, 2);
      expect(result.netRemittanceUsd).toBeCloseTo(expectedGross - expectedFee, 2);
      expect(result.netRemittanceUsd).toBeGreaterThan(0);
    });

    it('net can be negative when deductions exceed gross (10% fee + high costs)', () => {
      const gross = 2 * KG_TO_TROY_OZ * 60_000; // ~3.86M
      const result = computeSettlement({
        goldWeightFineKg: 2,
        lmePricePerTroyOz: 60_000,
        costs: [{ actualUsd: gross * 0.91, estimatedUsd: null }], // 91% of gross
        agentDisbursementsTotal: 0,
        companyFeePercent: 0.1,
      });

      // 91% costs + 10% companyFee = 101% → negative net
      expect(result.netRemittanceUsd).toBeLessThan(0);
    });
  });

  // ── Locked price used, not live LME ──────────────────────────────────────

  describe('locked price isolation', () => {
    it('uses the supplied lmePricePerTroyOz, not any live feed value', () => {
      const lockedPrice = 2_350;
      const livePrice = 2_500; // would be different if live feed were used

      const result = computeSettlement({
        goldWeightFineKg: 1,
        lmePricePerTroyOz: lockedPrice,
        costs: [],
        agentDisbursementsTotal: 0,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      });

      const expectedGross = KG_TO_TROY_OZ * lockedPrice;
      expect(result.grossProceedsUsd).toBeCloseTo(expectedGross, 2);

      // Verify the live price would produce a different result
      const liveResult = computeSettlement({
        goldWeightFineKg: 1,
        lmePricePerTroyOz: livePrice,
        costs: [],
        agentDisbursementsTotal: 0,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      });
      expect(liveResult.grossProceedsUsd).not.toBeCloseTo(result.grossProceedsUsd, 2);
    });
  });

  // ── All cost categories correctly deducted ────────────────────────────────

  describe('all cost categories', () => {
    it('sums all costs when multiple categories provided', () => {
      const result = computeSettlement({
        goldWeightFineKg: 2,
        lmePricePerTroyOz: 60_000,
        costs: [
          { actualUsd: 1_000, estimatedUsd: null }, // refining fee
          { actualUsd: 500, estimatedUsd: null }, // assay fee
          { actualUsd: 2_000, estimatedUsd: null }, // freight
          { actualUsd: 800, estimatedUsd: null }, // insurance
          { actualUsd: null, estimatedUsd: 300 }, // storage (estimated)
        ],
        agentDisbursementsTotal: 5_000,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      });

      expect(result.actualCostsUsd).toBe(4_600); // 1000+500+2000+800+300
      expect(result.agentFeeUsd).toBe(5_000);
    });

    it('handles empty cost array (zero costs)', () => {
      const result = computeSettlement({
        goldWeightFineKg: 1,
        lmePricePerTroyOz: 60_000,
        costs: [],
        agentDisbursementsTotal: 0,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      });

      expect(result.actualCostsUsd).toBe(0);
      expect(result.agentFeeUsd).toBe(0);
      expect(result.totalDeductionsUsd).toBeCloseTo(result.companyFeeUsd, 2);
    });

    it('handles cost items with both null actualUsd and null estimatedUsd as 0', () => {
      const result = computeSettlement({
        goldWeightFineKg: 1,
        lmePricePerTroyOz: 60_000,
        costs: [
          { actualUsd: null, estimatedUsd: null }, // should contribute 0
        ],
        agentDisbursementsTotal: 0,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      });

      expect(result.actualCostsUsd).toBe(0);
    });

    it('prefers actualUsd=0 over estimatedUsd when actualUsd is explicitly zero', () => {
      const result = computeSettlement({
        goldWeightFineKg: 1,
        lmePricePerTroyOz: 60_000,
        costs: [
          { actualUsd: 0, estimatedUsd: 9_999 }, // actualUsd=0 should win
        ],
        agentDisbursementsTotal: 0,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      });

      // actualUsd is 0 (not null), so estimatedUsd should NOT be used
      expect(result.actualCostsUsd).toBe(0);
    });
  });

  // ── Precision / edge cases ────────────────────────────────────────────────

  describe('numeric precision', () => {
    it('is consistent across multiple identical calls (deterministic)', () => {
      const input: SettlementInput = {
        goldWeightFineKg: 2,
        lmePricePerTroyOz: 60_000,
        costs: [{ actualUsd: 1_000, estimatedUsd: null }],
        agentDisbursementsTotal: 500,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      };

      const r1 = computeSettlement(input);
      const r2 = computeSettlement(input);

      expect(r1.grossProceedsUsd).toBe(r2.grossProceedsUsd);
      expect(r1.netRemittanceUsd).toBe(r2.netRemittanceUsd);
    });

    it('totalDeductionsUsd is the sum of all three deduction components', () => {
      const result = computeSettlement({
        goldWeightFineKg: 1.5,
        lmePricePerTroyOz: 2_350,
        costs: [{ actualUsd: 800, estimatedUsd: null }],
        agentDisbursementsTotal: 400,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      });

      expect(result.totalDeductionsUsd).toBeCloseTo(
        result.actualCostsUsd + result.agentFeeUsd + result.companyFeeUsd,
        5,
      );
    });

    it('grossProceedsUsd - totalDeductionsUsd = netRemittanceUsd exactly', () => {
      const result = computeSettlement({
        goldWeightFineKg: 3,
        lmePricePerTroyOz: 2_400,
        costs: [{ actualUsd: 1_200, estimatedUsd: null }],
        agentDisbursementsTotal: 600,
        companyFeePercent: COMPANY_FEE_DEFAULT,
      });

      const diff = result.grossProceedsUsd - result.totalDeductionsUsd;
      expect(result.netRemittanceUsd).toBeCloseTo(diff, 8);
    });
  });
});
