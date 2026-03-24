/**
 * Trade and export operation types for the gold finance platform.
 */

import type { ID, ISO8601, CurrencyCode, WeightUnit } from './common.js';

export type TradeStatus =
  | 'DRAFT'
  | 'PENDING_COMPLIANCE'
  | 'COMPLIANCE_APPROVED'
  | 'COMPLIANCE_REJECTED'
  | 'FUNDED'
  | 'EXPORT_PENDING'
  | 'EXPORTED'
  | 'SETTLED'
  | 'CANCELLED';

export type GoldPurity = '999.9' | '999' | '995' | '990' | '916' | '750';

export interface GoldLot {
  id: ID;
  weight: number;
  weightUnit: WeightUnit;
  purity: GoldPurity;
  assayCertificateUrl?: string;
  originCountry: string;
  mineSource?: string;
}

export interface TradeFinanceFacility {
  id: ID;
  referenceNumber: string;
  status: TradeStatus;
  borrowerId: ID;
  goldLots: GoldLot[];
  principalAmount: number;
  currency: CurrencyCode;
  interestRateBps: number;
  lmeGoldPriceAtOrigination: number;
  maturityDate: ISO8601;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface ExportDeclaration {
  id: ID;
  tradeId: ID;
  declarationNumber: string;
  exporterName: string;
  destinationCountry: string;
  portOfExit: string;
  declaredValue: number;
  currency: CurrencyCode;
  submittedAt?: ISO8601;
  approvedAt?: ISO8601;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
}
