import { prisma } from '@aop/db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  logger,
  KG_TO_TROY_OZ,
  COMPANY_FEE_DEFAULT,
} from '@aop/utils';
import { uploadToS3, getSignedDownloadUrl } from '../../lib/s3.js';
import { sendMail } from '../../lib/mailer.js';
import { getDailyRates } from '../../lib/fx.service.js';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import type { AuthenticatedUser } from '@aop/types';
import type { UpdateRemittanceStatusDto, ClearDiscrepancyDto } from './settlement.schemas.js';

// ---------------------------------------------------------------------------
// Pure computation — exported for unit testing
// ---------------------------------------------------------------------------

export interface SettlementInput {
  goldWeightFineKg: number;
  lmePricePerTroyOz: number;
  costs: Array<{ actualUsd: number | null; estimatedUsd: number | null }>;
  agentDisbursementsTotal: number;
  companyFeePercent: number; // e.g. 0.015
}

export interface SettlementResult {
  fineTroyOz: number;
  grossProceedsUsd: number;
  actualCostsUsd: number;
  agentFeeUsd: number;
  companyFeeUsd: number;
  totalDeductionsUsd: number;
  netRemittanceUsd: number;
}

export function computeSettlement(input: SettlementInput): SettlementResult {
  const fineTroyOz = input.goldWeightFineKg * KG_TO_TROY_OZ;
  const grossProceedsUsd = fineTroyOz * input.lmePricePerTroyOz;
  const actualCostsUsd = input.costs.reduce((sum, c) => {
    const amt = c.actualUsd != null ? c.actualUsd : (c.estimatedUsd ?? 0);
    return sum + amt;
  }, 0);
  const agentFeeUsd = input.agentDisbursementsTotal;
  const companyFeeUsd = grossProceedsUsd * input.companyFeePercent;
  const totalDeductionsUsd = actualCostsUsd + agentFeeUsd + companyFeeUsd;
  const netRemittanceUsd = grossProceedsUsd - totalDeductionsUsd;
  return {
    fineTroyOz,
    grossProceedsUsd,
    actualCostsUsd,
    agentFeeUsd,
    companyFeeUsd,
    totalDeductionsUsd,
    netRemittanceUsd,
  };
}

// ---------------------------------------------------------------------------
// PDF generation helpers
// ---------------------------------------------------------------------------

async function generatePdf(
  templateSource: string,
  context: Record<string, unknown>,
): Promise<Buffer> {
  const template = Handlebars.compile(templateSource);
  const html = template(context);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

const FINAL_SETTLEMENT_STATEMENT_TEMPLATE = `<!DOCTYPE html>
<html>
<head><style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a2e; }
  .header { border-bottom: 3px solid #C9963F; padding-bottom: 20px; margin-bottom: 30px; }
  .company { font-size: 24px; font-weight: bold; color: #C9963F; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { background: #1a1a2e; color: white; padding: 10px; text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  .total { font-weight: bold; font-size: 16px; background: #FDF3DC; }
  .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
  .signature-block { margin-top: 60px; }
  .signature-line { border-bottom: 1px solid #333; width: 200px; display: inline-block; }
</style></head>
<body>
  <div class="header">
    <div class="company">Aurum Gold Finance Ltd</div>
    <div>P.O. Box 12345, Nairobi, Kenya | aurum@aop.local</div>
  </div>
  <h2>FINAL SETTLEMENT STATEMENT</h2>
  <p><strong>Miner:</strong> {{minerName}}</p>
  <p><strong>Transaction ID:</strong> {{transactionId}}</p>
  <p><strong>Date:</strong> {{date}}</p>
  <p><strong>LME Price Used:</strong> USD {{lmePriceUsed}} / troy oz ({{priceType}}, locked {{lockDate}})</p>
  <table>
    <tr><th>Description</th><th>Amount (USD)</th></tr>
    <tr><td>Gross Proceeds ({{fineTroyOz}} troy oz @ {{lmePriceUsed}})</td><td>{{grossProceedsUsd}}</td></tr>
    {{#each costLines}}<tr><td>{{category}}</td><td>({{amountUsd}})</td></tr>{{/each}}
    <tr><td>Agent Fee</td><td>({{agentFeeUsd}})</td></tr>
    <tr><td>Company Fee ({{companyFeePct}}%)</td><td>({{companyFeeUsd}})</td></tr>
    <tr><td>Total Deductions</td><td>({{totalDeductionsUsd}})</td></tr>
    <tr class="total"><td>NET REMITTANCE</td><td>{{netRemittanceUsd}}</td></tr>
  </table>
  <div class="signature-block">
    <p>Authorised by: <span class="signature-line"></span></p>
    <p>Finance Manager, Aurum Gold Finance Ltd</p>
  </div>
  <div class="footer">This is a computer-generated statement — Aurum Gold Finance Ltd</div>
</body></html>`;

const REMITTANCE_INSTRUCTION_TEMPLATE = `<!DOCTYPE html>
<html>
<head><style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a2e; }
  .header { border-bottom: 3px solid #C9963F; padding-bottom: 20px; }
  h2 { color: #0D2B55; }
  .field { margin: 10px 0; } .label { font-weight: bold; min-width: 200px; display: inline-block; }
  .amount { font-size: 20px; color: #C9963F; font-weight: bold; margin: 20px 0; }
  .signature-line { border-bottom: 1px solid #333; width: 250px; display: inline-block; margin-top: 60px; }
</style></head>
<body>
  <div class="header"><h1 style="color:#C9963F">Aurum Gold Finance Ltd</h1></div>
  <h2>REMITTANCE INSTRUCTION</h2>
  <div class="field"><span class="label">Payment Reference:</span> AOP-REMIT-{{settlementId}}</div>
  <div class="field"><span class="label">Payee:</span> {{payeeName}}</div>
  <div class="field"><span class="label">Bank Name:</span> {{bankName}}</div>
  <div class="field"><span class="label">Account Number:</span> {{bankAccount}}</div>
  <div class="field"><span class="label">SWIFT / BIC:</span> {{swiftBic}}</div>
  <div class="amount">Amount: USD {{amountUsd}}<br><small>{{localCurrency}} {{localAmount}} (FX rate: {{fxRate}})</small></div>
  <div class="field"><span class="label">Remittance Date:</span> {{remittanceDate}}</div>
  <p>Authorised by: <br><span class="signature-line"></span><br>Finance Manager</p>
</body></html>`;

// ---------------------------------------------------------------------------
// Country → currency mapping
// ---------------------------------------------------------------------------

function getCurrencyForCountry(countryCode: string): string {
  const map: Record<string, string> = {
    KE: 'KES',
    UG: 'UGX',
    TZ: 'TZS',
    ZA: 'ZAR',
  };
  return map[countryCode.toUpperCase()] ?? 'USD';
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function calculateSettlement(txnId: string, actor: AuthenticatedUser) {
  // 1. Load transaction with relations
  const tx = await prisma.transaction.findUnique({
    where: { id: txnId },
    include: {
      client: true,
      costItems: true,
      disbursements: true,
      settlement: true,
    },
  });
  if (!tx) throw new NotFoundError('Transaction not found');

  // 2. Validate lmePriceLocked
  if (!tx.lmePriceLocked) {
    throw new ValidationError('LME price must be locked before settlement can be calculated');
  }

  // 3. Validate required Phase 4 documents
  const requiredDocTypes = [
    'ASSAY_CERTIFICATE',
    'CUSTOMS_DECLARATION',
    'CERTIFICATE_OF_ORIGIN',
  ] as const;
  const approvedDocs = await prisma.document.findMany({
    where: {
      transactionId: txnId,
      documentType: { in: [...requiredDocTypes] },
      approvalStatus: 'APPROVED',
    },
    select: { documentType: true },
  });
  const approvedTypes = new Set(approvedDocs.map((d) => d.documentType));
  const missingDocs = requiredDocTypes.filter((t) => !approvedTypes.has(t));
  if (missingDocs.length > 0) {
    throw new ValidationError(`Missing approved documents: ${missingDocs.join(', ')}`);
  }

  // 4. Calculate
  const result = computeSettlement({
    goldWeightFineKg: Number(tx.goldWeightFine),
    lmePricePerTroyOz: Number(tx.lmePriceLocked),
    costs: tx.costItems.map((c) => ({
      actualUsd: c.actualUsd != null ? Number(c.actualUsd) : null,
      estimatedUsd: c.estimatedUsd != null ? Number(c.estimatedUsd) : null,
    })),
    agentDisbursementsTotal: tx.disbursements.reduce((s, d) => s + Number(d.amountUsd), 0),
    companyFeePercent: COMPANY_FEE_DEFAULT,
  });

  // 5. Validate net remittance
  if (result.netRemittanceUsd <= 0) {
    throw new ValidationError('Net remittance must be positive — deductions exceed gross proceeds');
  }
  if (result.netRemittanceUsd < 0.1 * result.grossProceedsUsd) {
    logger.warn(
      {
        txnId,
        netRemittanceUsd: result.netRemittanceUsd,
        grossProceedsUsd: result.grossProceedsUsd,
      },
      'Net remittance is less than 10% of gross proceeds — unusually high deductions',
    );
  }

  // 6. Upsert settlement
  const settlement = await prisma.settlement.upsert({
    where: { transactionId: txnId },
    update: {
      grossProceedsUsd: result.grossProceedsUsd,
      actualCostsUsd: result.actualCostsUsd,
      agentFeeUsd: result.agentFeeUsd,
      totalDeductionsUsd: result.totalDeductionsUsd,
      companyFeeUsd: result.companyFeeUsd,
      companyFeePercent: COMPANY_FEE_DEFAULT,
      netRemittanceUsd: result.netRemittanceUsd,
      lmePriceUsed: Number(tx.lmePriceLocked),
      calculatedAt: new Date(),
    },
    create: {
      transactionId: txnId,
      grossProceedsUsd: result.grossProceedsUsd,
      actualCostsUsd: result.actualCostsUsd,
      agentFeeUsd: result.agentFeeUsd,
      totalDeductionsUsd: result.totalDeductionsUsd,
      companyFeeUsd: result.companyFeeUsd,
      companyFeePercent: COMPANY_FEE_DEFAULT,
      netRemittanceUsd: result.netRemittanceUsd,
      lmePriceUsed: Number(tx.lmePriceLocked),
      calculatedAt: new Date(),
    },
  });

  logger.info({ txnId, settlementId: settlement.id, actor: actor.id }, 'Settlement calculated');
  return settlement;
}

export async function getSettlement(txnId: string, _actor: AuthenticatedUser) {
  const settlement = await prisma.settlement.findUnique({
    where: { transactionId: txnId },
    include: { transaction: true },
  });
  // Return null if not yet calculated — preview state
  return settlement;
}

export async function approveSettlement(id: string, actor: AuthenticatedUser) {
  // 1. Load settlement with transaction
  const settlement = await prisma.settlement.findUnique({
    where: { id },
    include: {
      transaction: {
        include: {
          client: true,
          agent: true,
          costItems: true,
          disbursements: true,
        },
      },
    },
  });
  if (!settlement) throw new NotFoundError('Settlement not found');

  // 2. Role check
  if (actor.role !== 'TRADE_MANAGER' && actor.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Only TRADE_MANAGER or SUPER_ADMIN may approve settlements');
  }

  // 3. Already approved?
  if (settlement.approvedAt) {
    throw new ConflictError('Settlement already approved — IRREVERSIBLE');
  }

  // 4. Assay discrepancy flag
  if (settlement.transaction.assayDiscrepancyFlag) {
    throw new ValidationError('Assay discrepancy flag must be cleared before approval');
  }

  // 5. Generate PDF
  const tx = settlement.transaction;
  const costLines = tx.costItems.map((c) => ({
    category: c.category,
    amountUsd:
      c.actualUsd != null ? Number(c.actualUsd).toFixed(2) : Number(c.estimatedUsd ?? 0).toFixed(2),
  }));

  const pdfBuffer = await generatePdf(FINAL_SETTLEMENT_STATEMENT_TEMPLATE, {
    minerName: tx.client.fullName,
    transactionId: tx.id,
    date: new Date().toISOString().split('T')[0],
    lmePriceUsed: Number(settlement.lmePriceUsed).toFixed(2),
    priceType: 'LME Spot',
    lockDate: tx.priceLockedAt ? tx.priceLockedAt.toISOString().split('T')[0] : 'N/A',
    fineTroyOz: (Number(settlement.grossProceedsUsd) / Number(settlement.lmePriceUsed)).toFixed(4),
    grossProceedsUsd: Number(settlement.grossProceedsUsd).toFixed(2),
    costLines,
    agentFeeUsd: Number(settlement.agentFeeUsd).toFixed(2),
    companyFeePct: (Number(settlement.companyFeePercent) * 100).toFixed(2),
    companyFeeUsd: Number(settlement.companyFeeUsd).toFixed(2),
    totalDeductionsUsd: Number(settlement.totalDeductionsUsd).toFixed(2),
    netRemittanceUsd: Number(settlement.netRemittanceUsd).toFixed(2),
  });

  // 6. Upload to S3
  const { url: statementPdfUrl } = await uploadToS3(
    `settlements/${id}/statement.pdf`,
    pdfBuffer,
    'application/pdf',
  );

  // 7. Update settlement
  const updated = await prisma.settlement.update({
    where: { id },
    data: {
      statementPdfUrl,
      approvedBy: actor.id,
      approvedAt: new Date(),
    },
  });

  // 8. Update transaction status
  await prisma.transaction.update({
    where: { id: tx.id },
    data: { status: 'SETTLED' },
  });

  // 9. Fire-and-forget notify miner
  notifyMiner(id).catch((err) => {
    logger.error({ err, settlementId: id }, 'Failed to notify miner after settlement approval');
  });

  logger.info({ settlementId: id, actor: actor.id }, 'Settlement approved');
  return updated;
}

export async function generateRemittanceInstruction(id: string, actor: AuthenticatedUser) {
  // 1. Load settlement with transaction, client, agent
  const settlement = await prisma.settlement.findUnique({
    where: { id },
    include: {
      transaction: {
        include: { client: true, agent: true },
      },
    },
  });
  if (!settlement) throw new NotFoundError('Settlement not found');

  // 2. Must be approved
  if (!settlement.approvedAt) {
    throw new ValidationError(
      'Settlement must be approved before generating remittance instruction',
    );
  }

  const tx = settlement.transaction;
  const agent = tx.agent;

  // 3. Get FX rate
  const currency = getCurrencyForCountry(tx.countryCode);
  const fxRates = await getDailyRates();
  const fxRate = currency !== 'USD' ? (fxRates.rates[currency] ?? 1) : 1;
  const localAmount = (Number(settlement.netRemittanceUsd) * fxRate).toFixed(2);

  // 4. Generate PDF
  const pdfBuffer = await generatePdf(REMITTANCE_INSTRUCTION_TEMPLATE, {
    settlementId: id,
    payeeName: tx.client.fullName,
    bankName: agent.bankName ?? 'N/A',
    bankAccount: agent.bankAccount ?? 'N/A',
    swiftBic: agent.swiftBic ?? 'N/A',
    amountUsd: Number(settlement.netRemittanceUsd).toFixed(2),
    localCurrency: currency,
    localAmount,
    fxRate: fxRate.toFixed(4),
    remittanceDate: new Date().toISOString().split('T')[0],
  });

  // 5. Upload to S3
  const { url: remittanceInstructionUrl } = await uploadToS3(
    `settlements/${id}/remittance.pdf`,
    pdfBuffer,
    'application/pdf',
  );

  // 6. Update settlement
  const updated = await prisma.settlement.update({
    where: { id },
    data: { remittanceInstructionUrl },
  });

  logger.info({ settlementId: id, actor: actor.id }, 'Remittance instruction generated');
  return updated;
}

export async function updateRemittanceStatus(
  id: string,
  dto: UpdateRemittanceStatusDto,
  actor: AuthenticatedUser,
) {
  const settlement = await prisma.settlement.findUnique({ where: { id } });
  if (!settlement) throw new NotFoundError('Settlement not found');

  const updated = await prisma.settlement.update({
    where: { id },
    data: {
      remittanceStatus: dto.status,
      remittanceSentAt: dto.status === 'SENT' ? new Date() : undefined,
    },
  });

  logger.info(
    { settlementId: id, status: dto.status, actor: actor.id },
    'Remittance status updated',
  );
  return updated;
}

export async function notifyMiner(settlementId: string): Promise<void> {
  const MAX_RETRIES = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 1. Load settlement with relations
      const settlement = await prisma.settlement.findUnique({
        where: { id: settlementId },
        include: {
          transaction: {
            include: { client: true, agent: true },
          },
        },
      });
      if (!settlement) throw new NotFoundError('Settlement not found');

      const agent = settlement.transaction.agent;
      const toEmail = agent.contactEmail;
      if (!toEmail) {
        logger.warn({ settlementId }, 'No agent contact email — skipping miner notification');
        return;
      }

      // 2. Get signed URL for PDF
      if (!settlement.statementPdfUrl) {
        logger.warn({ settlementId }, 'No statement PDF URL — skipping miner notification');
        return;
      }

      const storageKey = `settlements/${settlementId}/statement.pdf`;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _signedUrl = await getSignedDownloadUrl(storageKey);

      // 3. Send email
      await sendMail({
        to: toEmail,
        subject: `Your Gold Settlement — Transaction ${settlement.transactionId} — Aurum Gold Finance`,
        text: 'Please find attached your Final Settlement Statement.',
      });

      // 4. Update notificationSentAt
      await prisma.settlement.update({
        where: { id: settlementId },
        data: { notificationSentAt: new Date() },
      });

      logger.info({ settlementId, toEmail }, 'Miner notification sent');
      return;
    } catch (err) {
      lastError = err;
      logger.warn({ err, settlementId, attempt }, `Notify miner attempt ${attempt} failed`);
    }
  }

  throw lastError;
}

export async function clearDiscrepancyFlag(
  txnId: string,
  dto: ClearDiscrepancyDto,
  actor: AuthenticatedUser,
) {
  const tx = await prisma.transaction.findUnique({
    where: { id: txnId },
    select: { id: true, assayDiscrepancyFlag: true },
  });
  if (!tx) throw new NotFoundError('Transaction not found');

  if (!tx.assayDiscrepancyFlag) {
    throw new ValidationError('No active discrepancy flag on this transaction');
  }

  const updated = await prisma.transaction.update({
    where: { id: txnId },
    data: {
      assayDiscrepancyFlag: false,
      assayDiscrepancyNote: dto.note,
    },
    select: { id: true, assayDiscrepancyFlag: true, assayDiscrepancyNote: true },
  });

  logger.info({ txnId, actor: actor.id }, 'Assay discrepancy flag cleared');
  return updated;
}

export async function discrepancyCheck(txnId: string, _actor: AuthenticatedUser) {
  const tx = await prisma.transaction.findUnique({
    where: { id: txnId },
    select: {
      goldWeightFine: true,
      goldWeightFineDestination: true,
      assayDiscrepancyFlag: true,
    },
  });
  if (!tx) throw new NotFoundError('Transaction not found');

  if (!tx.goldWeightFineDestination) {
    return { checked: false, reason: 'No destination assay weight recorded' };
  }

  const originWeight = Number(tx.goldWeightFine);
  const destinationWeight = Number(tx.goldWeightFineDestination);
  const discrepancyPct = (Math.abs(originWeight - destinationWeight) / originWeight) * 100;

  return {
    checked: true,
    originWeight,
    destinationWeight,
    discrepancyPct,
    flagged: tx.assayDiscrepancyFlag,
  };
}
