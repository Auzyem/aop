// docx v8 does not ship .d.mts files; TypeScript NodeNext ESM resolution falls back to a
// type declaration that omits these named exports at the type level, even though they exist
// at runtime. Using require() here avoids the ESM resolution path.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const docxLib = require('docx') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } =
  docxLib as {
    Document: any;
    Packer: any;
    Paragraph: any;
    TextRun: any;
    HeadingLevel: any;
    Table: any;
    TableRow: any;
    TableCell: any;
  };
import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { uploadToS3 } from '../../../lib/s3.js';
import type { Prisma } from '@aop/db';

type TxSummary = {
  id: string;
  countryCode: string;
  lmePriceLocked: Prisma.Decimal | null;
  goldWeightFine: Prisma.Decimal | null;
  createdAt: Date;
  client: {
    isPEP: boolean;
    isEDD: boolean;
    sanctionsStatus: string;
    riskRating: string;
  };
};

type ClientSummary = {
  id: string;
  fullName: string;
  countryCode: string;
  isPEP: boolean;
  isEDD: boolean;
  sanctionsStatus: string;
  riskRating: string;
};

export type OecdData = {
  byCountry: Array<{
    countryCode: string;
    transactionCount: number;
    totalValueUsd: number;
    riskRatingDistribution: Record<string, number>;
  }>;
  redFlagIncidents: Array<{
    transactionId: string;
    countryCode: string;
    reason: string;
  }>;
  periodStart: string;
  periodEnd: string;
};

export function assembleOecdData(
  transactions: TxSummary[],
  _clients: ClientSummary[],
  periodStart: Date,
  periodEnd: Date,
): OecdData {
  // Group by country
  const countryMap = new Map<
    string,
    { count: number; totalValue: number; riskRatings: Record<string, number> }
  >();

  for (const tx of transactions) {
    const existing = countryMap.get(tx.countryCode) ?? {
      count: 0,
      totalValue: 0,
      riskRatings: {},
    };

    const weightFine = tx.goldWeightFine ? Number(tx.goldWeightFine) : 0;
    const lme = tx.lmePriceLocked ? Number(tx.lmePriceLocked) : 0;
    const valueUsd = (weightFine / 31.1035) * lme; // troy oz conversion

    existing.count += 1;
    existing.totalValue += valueUsd;

    const rating = tx.client.riskRating ?? 'UNKNOWN';
    existing.riskRatings[rating] = (existing.riskRatings[rating] ?? 0) + 1;

    countryMap.set(tx.countryCode, existing);
  }

  const byCountry = Array.from(countryMap.entries()).map(([countryCode, data]) => ({
    countryCode,
    transactionCount: data.count,
    totalValueUsd: Math.round(data.totalValue * 100) / 100,
    riskRatingDistribution: data.riskRatings,
  }));

  // Red flag incidents
  const redFlagIncidents: Array<{ transactionId: string; countryCode: string; reason: string }> =
    [];

  for (const tx of transactions) {
    const reasons: string[] = [];
    if (tx.client.isPEP) reasons.push('PEP client');
    if (tx.client.isEDD) reasons.push('EDD client');
    if (tx.client.sanctionsStatus === 'HIT') reasons.push('Sanctions hit');

    if (reasons.length > 0) {
      redFlagIncidents.push({
        transactionId: tx.id,
        countryCode: tx.countryCode,
        reason: reasons.join(', '),
      });
    }
  }

  return {
    byCountry,
    redFlagIncidents,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

async function generateDocx(oecdData: OecdData, _year: number): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [
    new Paragraph({
      text: 'OECD Due Diligence Report',
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      text: `Period: ${oecdData.periodStart} to ${oecdData.periodEnd}`,
    }),
    new Paragraph({ text: '' }),

    // Section 1: Company Policy Statement
    new Paragraph({
      text: '1. Company Policy Statement',
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Aurum Gold Finance Ltd is committed to responsible gold sourcing in accordance with the OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas (5-Step Framework). Our policy prohibits sourcing from conflict-affected areas, and we conduct enhanced due diligence on all high-risk counterparties.',
        }),
      ],
    }),
    new Paragraph({ text: '' }),

    // Section 2: Risk Assessment
    new Paragraph({
      text: '2. Risk Assessment by Country',
      heading: HeadingLevel.HEADING_1,
    }),
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: 'Country', bold: true })] }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: 'Transactions', bold: true })] }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Total Value (USD)', bold: true })],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Risk Distribution', bold: true })],
                }),
              ],
            }),
          ],
        }),
        ...oecdData.byCountry.map(
          (row) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: row.countryCode })] }),
                new TableCell({
                  children: [new Paragraph({ text: String(row.transactionCount) })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: `$${row.totalValueUsd.toFixed(2)}` })],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      text: Object.entries(row.riskRatingDistribution)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', '),
                    }),
                  ],
                }),
              ],
            }),
        ),
      ],
    }),
    new Paragraph({ text: '' }),

    // Section 3: Supply Chain Mapping
    new Paragraph({
      text: '3. Supply Chain Mapping',
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      text: 'Supply chain mapping data is maintained in the AOP platform and available on request. All miners and refineries are verified through the platform KYC process.',
    }),
    new Paragraph({ text: '' }),

    // Section 4: Red Flag Incidents
    new Paragraph({
      text: '4. Red Flag Incidents',
      heading: HeadingLevel.HEADING_1,
    }),
    ...(oecdData.redFlagIncidents.length === 0
      ? [new Paragraph({ text: 'No red flag incidents identified in this period.' })]
      : [
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: 'Transaction ID', bold: true })],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: 'Country', bold: true })] }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: 'Reason', bold: true })] }),
                    ],
                  }),
                ],
              }),
              ...oecdData.redFlagIncidents.map(
                (incident) =>
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({ text: incident.transactionId })],
                      }),
                      new TableCell({ children: [new Paragraph({ text: incident.countryCode })] }),
                      new TableCell({ children: [new Paragraph({ text: incident.reason })] }),
                    ],
                  }),
              ),
            ],
          }),
        ]),
    new Paragraph({ text: '' }),

    // Section 5: Response Strategy
    new Paragraph({
      text: '5. Response Strategy',
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      text: `Total red flag incidents: ${oecdData.redFlagIncidents.length}. For each flagged incident, enhanced due diligence procedures have been or will be initiated. Transactions with unresolved red flags are suspended pending compliance review.`,
    }),
  ];

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

export async function generateOecdDueDiligence(
  periodStart: Date,
  periodEnd: Date,
): Promise<{ storageKey: string; url: string }> {
  const [transactions, clients] = await Promise.all([
    prisma.transaction.findMany({
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
      select: {
        id: true,
        countryCode: true,
        lmePriceLocked: true,
        goldWeightFine: true,
        createdAt: true,
        client: {
          select: {
            isPEP: true,
            isEDD: true,
            sanctionsStatus: true,
            riskRating: true,
          },
        },
      },
    }),
    prisma.client.findMany({
      select: {
        id: true,
        fullName: true,
        countryCode: true,
        isPEP: true,
        isEDD: true,
        sanctionsStatus: true,
        riskRating: true,
      },
    }),
  ]);

  const oecdData = assembleOecdData(transactions, clients, periodStart, periodEnd);
  const year = periodStart.getFullYear();
  const docxBuffer = await generateDocx(oecdData, year);

  const key = `reports/oecd/${year}.docx`;
  const result = await uploadToS3(
    key,
    docxBuffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );

  logger.info({ year, storageKey: result.storageKey }, 'OECD Due Diligence report generated');
  return result;
}
