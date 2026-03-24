// docx v8 does not ship .d.mts files; use require() to avoid NodeNext ESM type resolution issues
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const docxLib = require('docx') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docxLib as {
  Document: any;
  Packer: any;
  Paragraph: any;
  TextRun: any;
  HeadingLevel: any;
};
import { prisma } from '@aop/db';
import { NotFoundError } from '@aop/utils';
import { logger } from '@aop/utils';
import { uploadToS3 } from '../../../lib/s3.js';
import type { Prisma } from '@aop/db';

type TransactionForStr = {
  id: string;
  countryCode: string;
  phase: string;
  status: string;
  goldWeightGross: Prisma.Decimal | null;
  goldWeightFine: Prisma.Decimal | null;
  lmePriceLocked: Prisma.Decimal | null;
  createdAt: Date;
  client: {
    fullName: string;
    entityType: string;
    countryCode: string;
    kycStatus: string;
    sanctionsStatus: string;
    riskRating: string;
    isPEP: boolean;
    isEDD: boolean;
  };
};

type ClientForStr = {
  fullName: string;
  entityType: string;
  countryCode: string;
  kycStatus: string;
  sanctionsStatus: string;
  riskRating: string;
  isPEP: boolean;
  isEDD: boolean;
};

export type StrTemplateData = {
  partA: {
    reportingInstitution: string;
    reportDate: string;
    referenceNumber: string;
  };
  partB: {
    subjectName: string;
    entityType: string;
    nationality: string;
    idType: string;
    idValue: string;
    address: string;
  };
  partC: {
    activityDescription: string;
    suspiciousIndicators: string[];
    dateOfActivity: string;
    locationOfActivity: string;
  };
  partD: {
    currency: string;
    approximateValue: string;
    goldWeightGross: string;
    goldWeightFine: string;
    transactionId: string;
    transactionPhase: string;
  };
};

export function populateStrTemplate(tx: TransactionForStr, client: ClientForStr): StrTemplateData {
  const now = new Date();
  const refNumber = `STR-${tx.id}-${now.getFullYear()}`;

  const suspiciousIndicators: string[] = [];
  if (client.isPEP) suspiciousIndicators.push('Client is a Politically Exposed Person (PEP)');
  if (client.isEDD) suspiciousIndicators.push('Client is subject to Enhanced Due Diligence (EDD)');
  if (client.sanctionsStatus === 'HIT')
    suspiciousIndicators.push('Client has a sanctions screening hit');
  if (client.riskRating === 'HIGH') suspiciousIndicators.push('Client has HIGH risk rating');
  if (client.riskRating === 'CRITICAL')
    suspiciousIndicators.push('Client has CRITICAL risk rating');
  if (client.kycStatus !== 'APPROVED')
    suspiciousIndicators.push(`KYC status is ${client.kycStatus}`);

  const weightFine = tx.goldWeightFine ? Number(tx.goldWeightFine) : 0;
  const lme = tx.lmePriceLocked ? Number(tx.lmePriceLocked) : 0;
  const approxValueUsd = (weightFine / 31.1035) * lme;

  const activityDescription =
    `Transaction ${tx.id} involves gold acquisition with gross weight ${tx.goldWeightGross ? Number(tx.goldWeightGross).toFixed(3) : 'N/A'} g ` +
    `(fine weight: ${weightFine.toFixed(3)} g) from client ${client.fullName} (${client.entityType}) ` +
    `in ${tx.countryCode}. Transaction is currently in phase ${tx.phase} with status ${tx.status}. ` +
    (suspiciousIndicators.length > 0
      ? `The following suspicious indicators were identified: ${suspiciousIndicators.join('; ')}.`
      : 'No automated suspicious indicators identified; report generated for manual review.');

  return {
    partA: {
      reportingInstitution: 'Aurum Gold Finance Ltd',
      reportDate: now.toISOString().split('T')[0],
      referenceNumber: refNumber,
    },
    partB: {
      subjectName: client.fullName,
      entityType: client.entityType,
      nationality: client.countryCode,
      idType: 'KYC_RECORD',
      idValue: 'See KYC documentation on file',
      address: `${client.countryCode} — see KYC documentation`,
    },
    partC: {
      activityDescription,
      suspiciousIndicators,
      dateOfActivity: tx.createdAt.toISOString().split('T')[0],
      locationOfActivity: tx.countryCode,
    },
    partD: {
      currency: 'USD',
      approximateValue: `$${approxValueUsd.toFixed(2)}`,
      goldWeightGross: tx.goldWeightGross ? `${Number(tx.goldWeightGross).toFixed(3)} g` : 'N/A',
      goldWeightFine: `${weightFine.toFixed(3)} g`,
      transactionId: tx.id,
      transactionPhase: tx.phase,
    },
  };
}

async function buildDocx(data: StrTemplateData): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: 'SUSPICIOUS TRANSACTION REPORT (DRAFT)',
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({ text: `Reference: ${data.partA.referenceNumber}` }),
          new Paragraph({ text: `Date: ${data.partA.reportDate}` }),
          new Paragraph({
            text: 'STATUS: DRAFT — NOT FOR SUBMISSION WITHOUT MANUAL REVIEW',
            children: [
              new TextRun({
                text: 'STATUS: DRAFT — NOT FOR SUBMISSION WITHOUT MANUAL REVIEW',
                bold: true,
                color: 'FF0000',
              }),
            ],
          }),
          new Paragraph({ text: '' }),

          new Paragraph({
            text: 'Part A: Reporting Institution Details',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Institution: ', bold: true }),
              new TextRun(data.partA.reportingInstitution),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Report Date: ', bold: true }),
              new TextRun(data.partA.reportDate),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Reference Number: ', bold: true }),
              new TextRun(data.partA.referenceNumber),
            ],
          }),
          new Paragraph({ text: '' }),

          new Paragraph({ text: 'Part B: Subject Information', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Subject Name: ', bold: true }),
              new TextRun(data.partB.subjectName),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Entity Type: ', bold: true }),
              new TextRun(data.partB.entityType),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Nationality/Country: ', bold: true }),
              new TextRun(data.partB.nationality),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'ID Type: ', bold: true }),
              new TextRun(data.partB.idType),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'ID Value: ', bold: true }),
              new TextRun(data.partB.idValue),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Address: ', bold: true }),
              new TextRun(data.partB.address),
            ],
          }),
          new Paragraph({ text: '' }),

          new Paragraph({
            text: 'Part C: Suspicious Activity Description',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Date of Activity: ', bold: true }),
              new TextRun(data.partC.dateOfActivity),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Location: ', bold: true }),
              new TextRun(data.partC.locationOfActivity),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: 'Description: ', bold: true })] }),
          new Paragraph({ text: data.partC.activityDescription }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: 'Suspicious Indicators:', bold: true })],
          }),
          ...(data.partC.suspiciousIndicators.length > 0
            ? data.partC.suspiciousIndicators.map(
                (indicator) => new Paragraph({ text: `• ${indicator}` }),
              )
            : [new Paragraph({ text: 'None automatically identified — manual review required.' })]),
          new Paragraph({ text: '' }),

          new Paragraph({
            text: 'Part D: Funds / Value Involved',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Transaction ID: ', bold: true }),
              new TextRun(data.partD.transactionId),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Currency: ', bold: true }),
              new TextRun(data.partD.currency),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Approximate Value: ', bold: true }),
              new TextRun(data.partD.approximateValue),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Gold Weight (Gross): ', bold: true }),
              new TextRun(data.partD.goldWeightGross),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Gold Weight (Fine): ', bold: true }),
              new TextRun(data.partD.goldWeightFine),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Transaction Phase: ', bold: true }),
              new TextRun(data.partD.transactionPhase),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export async function generateStrDraft(
  txnId: string,
): Promise<{ storageKey: string; url: string }> {
  const tx = await prisma.transaction.findUnique({
    where: { id: txnId },
    select: {
      id: true,
      countryCode: true,
      phase: true,
      status: true,
      goldWeightGross: true,
      goldWeightFine: true,
      lmePriceLocked: true,
      createdAt: true,
      client: {
        select: {
          fullName: true,
          entityType: true,
          countryCode: true,
          kycStatus: true,
          sanctionsStatus: true,
          riskRating: true,
          isPEP: true,
          isEDD: true,
        },
      },
    },
  });

  if (!tx) throw new NotFoundError('Transaction', txnId);

  const templateData = populateStrTemplate(tx, tx.client);
  const docxBuffer = await buildDocx(templateData);

  const key = `reports/str/${txnId}/${Date.now()}.docx`;
  const result = await uploadToS3(
    key,
    docxBuffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );

  logger.info({ txnId, storageKey: result.storageKey }, 'STR draft report generated');
  return result;
}
