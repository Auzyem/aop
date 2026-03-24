import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@aop/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@aop/utils';
import { logger } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import { uploadToS3 } from '../../lib/s3.js';
import type { RequestDisbursementDto, QueryReceiptDto } from './finance.schemas.js';

// ---------------------------------------------------------------------------
// Disbursement rule checking — pure function for testability
// ---------------------------------------------------------------------------

export interface DisbursementRuleContext {
  trancheNo: number;
  estimateStatus: string | null;
  tranche1Disbursements: Array<{ id: string; status: string }>;
  tranche1Receipts: Array<{ disbursementId: string; status: string; uploadedAt: Date }>;
  /** All sent disbursements for this agent (across all transactions) */
  agentSentDisbursements: Array<{ id: string; sentAt: Date | null }>;
  /** Receipts for agentSentDisbursements */
  agentReceipts: Array<{ disbursementId: string; status: string; uploadedAt: Date }>;
  now: Date;
}

export interface DisbursementRuleResult {
  allowed: boolean;
  reason?: string;
}

const UNRECONCILED_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Pure function: evaluates all disbursement control rules.
 * No I/O — all data pre-fetched by the caller.
 */
export function checkDisbursementRules(ctx: DisbursementRuleContext): DisbursementRuleResult {
  // Rule 1: Tranche 1 only after CostEstimate is APPROVED
  if (ctx.trancheNo === 1 && ctx.estimateStatus !== 'APPROVED') {
    return {
      allowed: false,
      reason: 'Cost estimate must be approved before requesting first disbursement',
    };
  }

  // Rule 2: Tranche 2+ only after all Tranche 1 receipts are uploaded (and approved)
  if (ctx.trancheNo >= 2) {
    const tranche1Sent = ctx.tranche1Disbursements.filter((d) => d.status === 'SENT');
    if (tranche1Sent.length === 0) {
      return { allowed: false, reason: 'Tranche 1 must be sent before requesting Tranche 2+' };
    }
    for (const d of tranche1Sent) {
      const receipt = ctx.tranche1Receipts.find(
        (r) => r.disbursementId === d.id && r.status === 'APPROVED',
      );
      if (!receipt) {
        return {
          allowed: false,
          reason: 'All Tranche 1 receipts must be approved before requesting Tranche 2+',
        };
      }
    }
  }

  // Rule 3: No disbursement if agent has unreconciled items > 48 hours old
  for (const d of ctx.agentSentDisbursements) {
    if (!d.sentAt) continue;
    const sentMs = d.sentAt.getTime();
    const ageMs = ctx.now.getTime() - sentMs;
    if (ageMs <= UNRECONCILED_THRESHOLD_MS) continue; // within 48h window, ok

    // Over 48h — check if there's an approved receipt
    const hasApprovedReceipt = ctx.agentReceipts.some(
      (r) => r.disbursementId === d.id && r.status === 'APPROVED',
    );
    if (!hasApprovedReceipt) {
      return {
        allowed: false,
        reason: `Agent has unreconciled disbursement (${d.id}) older than 48 hours`,
      };
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

async function loadDisbursement(id: string) {
  const d = await prisma.disbursement.findUnique({
    where: { id },
    include: { agent: true, transaction: true, receipts: true },
  });
  if (!d) throw new NotFoundError('Disbursement not found');
  return d;
}

export async function getDisbursements(txnId: string, _actor: AuthenticatedUser) {
  const tx = await prisma.transaction.findUnique({ where: { id: txnId } });
  if (!tx) throw new NotFoundError('Transaction not found');

  return prisma.disbursement.findMany({
    where: { transactionId: txnId },
    orderBy: { trancheNo: 'asc' },
    include: { receipts: true, approvedByUser: { select: { id: true, email: true } } },
  });
}

export async function requestDisbursement(
  txnId: string,
  dto: RequestDisbursementDto,
  _actor: AuthenticatedUser,
) {
  const tx = await prisma.transaction.findUnique({
    where: { id: txnId },
    include: {
      costEstimate: true,
      disbursements: {
        include: { receipts: true },
        orderBy: { trancheNo: 'asc' },
      },
      agent: true,
    },
  });
  if (!tx) throw new NotFoundError('Transaction not found');

  // Determine next tranche number
  const nextTranche =
    tx.disbursements.length === 0 ? 1 : tx.disbursements[tx.disbursements.length - 1].trancheNo + 1;

  // Collect agent's sent disbursements across ALL transactions (for rule 3)
  const agentSent = await prisma.disbursement.findMany({
    where: { agentId: tx.agentId, status: 'SENT' },
    include: { receipts: true },
  });

  const allAgentReceipts = agentSent.flatMap((d) =>
    d.receipts.map((r) => ({
      disbursementId: d.id,
      status: r.status,
      uploadedAt: r.uploadedAt,
    })),
  );

  const tranche1 = tx.disbursements.filter((d) => d.trancheNo === 1);
  const tranche1Receipts = tranche1.flatMap((d) =>
    d.receipts.map((r) => ({
      disbursementId: d.id,
      status: r.status,
      uploadedAt: r.uploadedAt,
    })),
  );

  const ruleResult = checkDisbursementRules({
    trancheNo: nextTranche,
    estimateStatus: tx.costEstimate?.status ?? null,
    tranche1Disbursements: tranche1.map((d) => ({ id: d.id, status: d.status })),
    tranche1Receipts,
    agentSentDisbursements: agentSent.map((d) => ({ id: d.id, sentAt: d.sentAt })),
    agentReceipts: allAgentReceipts,
    now: new Date(),
  });

  if (!ruleResult.allowed) {
    throw new ValidationError(ruleResult.reason ?? 'Disbursement not allowed');
  }

  return prisma.disbursement.create({
    data: {
      transactionId: txnId,
      agentId: tx.agentId,
      trancheNo: nextTranche,
      amountUsd: dto.amountUsd,
      bankRef: dto.bankRef,
      requestedAt: new Date(),
    },
  });
}

export async function approveDisbursement(id: string, actor: AuthenticatedUser) {
  const d = await loadDisbursement(id);
  if (d.status !== 'PENDING') {
    throw new ValidationError(`Cannot approve disbursement in ${d.status} state`);
  }

  return prisma.disbursement.update({
    where: { id },
    data: { status: 'APPROVED', approvedBy: actor.id, approvedAt: new Date() },
  });
}

export async function markDisbursementSent(id: string, _actor: AuthenticatedUser) {
  const d = await loadDisbursement(id);
  if (d.status !== 'APPROVED') {
    throw new ValidationError(`Cannot mark as sent — disbursement is ${d.status}`);
  }

  // Generate PDF disbursement instruction letter
  const instructionPdfUrl = await generateDisbursementLetter(d);

  return prisma.disbursement.update({
    where: { id },
    data: { status: 'SENT', sentAt: new Date(), instructionPdfUrl },
  });
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export async function uploadReceipt(
  disbursementId: string,
  file: Express.Multer.File,
  actor: AuthenticatedUser,
) {
  const d = await prisma.disbursement.findUnique({ where: { id: disbursementId } });
  if (!d) throw new NotFoundError('Disbursement not found');
  if (d.status !== 'SENT') {
    throw new ValidationError('Receipts can only be uploaded after disbursement is sent');
  }

  // Scoping: OPERATIONS can only upload receipts for their agent's disbursements
  if (actor.role === 'OPERATIONS' && actor.agentId && d.agentId !== actor.agentId) {
    throw new ForbiddenError('You can only upload receipts for your own agent');
  }

  const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);
  if (!ALLOWED.has(file.mimetype)) {
    throw new ValidationError('Only PDF, JPEG, and PNG files are accepted');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new ValidationError('Receipt file too large — maximum 20 MB');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `receipts/${disbursementId}/${timestamp}-${safeName}`;

  const { storageKey } = await uploadToS3(key, file.buffer, file.mimetype);

  return prisma.disbursementReceipt.create({
    data: {
      disbursementId,
      storageKey,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: actor.id,
    },
  });
}

export async function approveReceipt(
  disbursementId: string,
  receiptId: string,
  actor: AuthenticatedUser,
) {
  const r = await prisma.disbursementReceipt.findUnique({ where: { id: receiptId } });
  if (!r || r.disbursementId !== disbursementId) {
    throw new NotFoundError('Receipt not found');
  }
  if (r.status === 'APPROVED') throw new ValidationError('Receipt already approved');

  return prisma.disbursementReceipt.update({
    where: { id: receiptId },
    data: { status: 'APPROVED', reviewedBy: actor.id, reviewedAt: new Date() },
  });
}

export async function queryReceipt(
  disbursementId: string,
  receiptId: string,
  dto: QueryReceiptDto,
  actor: AuthenticatedUser,
) {
  const r = await prisma.disbursementReceipt.findUnique({ where: { id: receiptId } });
  if (!r || r.disbursementId !== disbursementId) {
    throw new NotFoundError('Receipt not found');
  }
  if (r.status === 'APPROVED') throw new ValidationError('Cannot query an approved receipt');

  return prisma.disbursementReceipt.update({
    where: { id: receiptId },
    data: {
      status: 'QUERIED',
      queryNote: dto.note,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// PDF letter generation (disbursement instruction)
// ---------------------------------------------------------------------------

async function generateDisbursementLetter(
  d: Awaited<ReturnType<typeof loadDisbursement>>,
): Promise<string> {
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 800;
    const line = (label: string, value: string) => {
      page.drawText(`${label}:`, { x: 50, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(value, { x: 200, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
      y -= 16;
    };

    page.drawText('DISBURSEMENT INSTRUCTION LETTER', { x: 50, y, size: 14, font: bold });
    y -= 30;
    page.drawLine({
      start: { x: 50, y },
      end: { x: 545, y },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 20;

    line('Reference', `${d.transactionId} / Tranche ${d.trancheNo}`);
    line('Date', new Date().toISOString().split('T')[0]);
    line('Disbursement ID', d.id);
    y -= 10;
    line('Payee', d.agent.companyName);
    line('Bank Name', d.agent.bankName ?? 'Not provided');
    line('Bank Account', d.agent.bankAccount ?? 'Not provided');
    y -= 10;
    line('Amount (USD)', `USD ${Number(d.amountUsd).toFixed(2)}`);
    line('Bank Reference', d.bankRef ?? d.id);
    y -= 20;
    page.drawText(
      'Please process the above disbursement and retain this letter for your records.',
      {
        x: 50,
        y,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      },
    );

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    const key = `letters/disbursement-${d.id}.pdf`;
    const { storageKey } = await uploadToS3(key, buffer, 'application/pdf');
    return storageKey;
  } catch (err) {
    logger.warn({ err, disbursementId: d.id }, 'Failed to generate disbursement letter');
    return '';
  }
}
