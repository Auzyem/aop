import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@aop/db';
import type { LmePriceType } from '@aop/db';
import { NotFoundError, ValidationError, TROY_OZ_PER_GRAM, COMPANY_FEE_DEFAULT } from '@aop/utils';
import { logger } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import { uploadToS3 } from '../../lib/s3.js';
import type { PriceLockDto } from './lme.schemas.js';

export async function lockTransactionPrice(
  txnId: string,
  dto: PriceLockDto,
  actor: AuthenticatedUser,
) {
  const tx = await prisma.transaction.findUnique({
    where: { id: txnId },
    include: {
      client: { select: { fullName: true } },
      agent: { select: { companyName: true } },
      costItems: { select: { estimatedUsd: true } },
    },
  });
  if (!tx) throw new NotFoundError('Transaction not found');
  if (tx.lmePriceLocked) {
    throw new ValidationError('Price already locked for this transaction');
  }
  if (!tx.goldWeightFine) {
    throw new ValidationError('Fine weight must be recorded before locking price');
  }

  // Find or create the matching LmePriceRecord
  const now = new Date();
  let priceRecord = await prisma.lmePriceRecord.findFirst({
    where: {
      priceType: dto.priceType as LmePriceType,
      recordedAt: { gte: new Date(now.getTime() - 90_000) }, // within 90s
    },
    orderBy: { recordedAt: 'desc' },
  });

  if (!priceRecord) {
    priceRecord = await prisma.lmePriceRecord.create({
      data: {
        priceUsdPerTroyOz: dto.lockedPrice,
        priceType: dto.priceType as LmePriceType,
        source: 'MANUAL_LOCK',
        recordedAt: now,
      },
    });
  }

  // Generate Valuation Disclosure PDF
  const pdfUrl = await generateValuationDisclosure(tx, dto, actor, now).catch((err) => {
    logger.warn({ err, txnId }, 'Failed to generate valuation disclosure PDF');
    return null;
  });

  // Store PDF as a Document
  if (pdfUrl) {
    await prisma.document.create({
      data: {
        transactionId: txnId,
        documentType: 'COMMERCIAL_INVOICE',
        filename: `valuation-disclosure-${txnId}.pdf`,
        storageKey: pdfUrl,
        mimeType: 'application/pdf',
        sizeBytes: 0, // populated after upload
        uploadedBy: actor.id,
        isSystemGenerated: true,
        approvalStatus: 'APPROVED',
        approvedBy: actor.id,
        approvedAt: now,
        retainUntil: new Date(now.getFullYear() + 10, now.getMonth(), now.getDate()),
      },
    });
  }

  // Lock the price on the transaction
  return prisma.transaction.update({
    where: { id: txnId },
    data: {
      lmePriceLocked: dto.lockedPrice,
      priceLockedAt: now,
      priceLockedBy: actor.id,
    },
    include: {
      client: { select: { id: true, fullName: true } },
      agent: { select: { id: true, companyName: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// PDF Valuation Disclosure
// ---------------------------------------------------------------------------

async function generateValuationDisclosure(
  tx: {
    id: string;
    goldWeightFine: unknown;
    goldWeightGross: unknown;
    client: { fullName: string };
    agent: { companyName: string };
    costItems: Array<{ estimatedUsd: unknown }>;
  },
  dto: PriceLockDto,
  actor: AuthenticatedUser,
  lockDate: Date,
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const field = (label: string, value: string) => {
    page.drawText(`${label}:`, { x: 50, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value, { x: 220, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 16;
  };

  page.drawText('VALUATION DISCLOSURE DOCUMENT', { x: 50, y, size: 13, font: bold });
  y -= 6;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 545, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 18;

  field('Transaction ID', tx.id);
  field('Miner / Client', tx.client.fullName);
  field('Agent', tx.agent.companyName);
  y -= 6;

  const fineGrams = Number(tx.goldWeightFine);
  const fineWeightTroyOz = fineGrams / TROY_OZ_PER_GRAM;
  const grossValueUsd = fineWeightTroyOz * dto.lockedPrice;
  const totalCosts = tx.costItems.reduce(
    (s, c) => s + (c.estimatedUsd ? Number(c.estimatedUsd) : 0),
    0,
  );
  const companyFeeUsd = grossValueUsd * COMPANY_FEE_DEFAULT;
  const estimatedNet = grossValueUsd - totalCosts - companyFeeUsd;

  field('Fine Weight', `${fineGrams.toFixed(4)} g  (${fineWeightTroyOz.toFixed(4)} troy oz)`);
  field('Locked Price', `USD ${dto.lockedPrice.toFixed(2)} / troy oz`);
  field('Price Type', dto.priceType);
  field('Price Source', 'LME / Metals-API');
  y -= 6;

  page.drawText('INDICATIVE VALUATION (ESTIMATE)', { x: 50, y, size: 9, font: bold });
  y -= 14;
  field('Gross Value (USD)', grossValueUsd.toFixed(2));
  field('Estimated Costs (USD)', totalCosts.toFixed(2));
  field('Company Fee (USD)', companyFeeUsd.toFixed(2));
  field('Estimated Net (USD)', estimatedNet.toFixed(2));
  y -= 10;

  field('Lock Date / Time (UTC)', lockDate.toISOString());
  field('Authorised By', actor.email);
  y -= 20;

  page.drawText(
    'This document is an indicative valuation only. Final settlement values may differ.',
    { x: 50, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) },
  );

  const pdfBytes = await pdfDoc.save();
  const key = `valuation-disclosure/${tx.id}/${lockDate.getTime()}.pdf`;
  const { storageKey } = await uploadToS3(key, Buffer.from(pdfBytes), 'application/pdf');
  return storageKey;
}
