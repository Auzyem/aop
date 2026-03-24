import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { uploadToS3 } from '../../../lib/s3.js';
import { renderPdf } from './base.js';

const TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Monthly Transaction Activity Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; }
    h2 { color: #16213e; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    th { background: #1a1a2e; color: white; padding: 6px; text-align: left; }
    td { border: 1px solid #ddd; padding: 6px; }
    tr:nth-child(even) { background: #f9f9f9; }
    .summary-box { background: #f0f4f8; border-left: 4px solid #1a1a2e; padding: 12px; margin: 12px 0; }
  </style>
</head>
<body>
  <h1>Monthly Transaction Activity Report</h1>
  <p><strong>Period:</strong> {{periodStart}} to {{periodEnd}}</p>
  <p><strong>Generated:</strong> {{generatedAt}}</p>

  <div class="summary-box">
    <h2>Summary</h2>
    <p>Total Transactions: <strong>{{totalCount}}</strong></p>
    <p>Total Gold Volume (fine): <strong>{{totalWeight}} g</strong></p>
    <p>Total Company Fees Earned: <strong>USD {{totalFees}}</strong></p>
  </div>

  <h2>Transactions by Country</h2>
  <table>
    <tr><th>Country</th><th>Count</th><th>Total Weight (g)</th><th>Total Value (USD)</th></tr>
    {{#each byCountry}}
    <tr>
      <td>{{this.countryCode}}</td>
      <td>{{this.count}}</td>
      <td>{{this.totalWeight}}</td>
      <td>USD {{this.totalValue}}</td>
    </tr>
    {{/each}}
  </table>

  <h2>Transaction Detail</h2>
  <table>
    <tr><th>ID</th><th>Client</th><th>Country</th><th>Weight (g)</th><th>Value (USD)</th><th>Phase</th><th>Status</th></tr>
    {{#each transactions}}
    <tr>
      <td>{{this.id}}</td>
      <td>{{this.clientName}}</td>
      <td>{{this.countryCode}}</td>
      <td>{{this.weight}}</td>
      <td>{{this.value}}</td>
      <td>{{this.phase}}</td>
      <td>{{this.status}}</td>
    </tr>
    {{/each}}
  </table>
</body>
</html>
`;

export async function generateTransactionActivity(
  periodStart: Date,
  periodEnd: Date,
): Promise<{ storageKey: string; url: string }> {
  const transactions = await prisma.transaction.findMany({
    where: { createdAt: { gte: periodStart, lte: periodEnd } },
    select: {
      id: true,
      countryCode: true,
      phase: true,
      status: true,
      goldWeightFine: true,
      lmePriceLocked: true,
      client: { select: { fullName: true } },
      agent: { select: { companyName: true } },
      settlement: { select: { companyFeeUsd: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Aggregate by country
  const countryMap = new Map<string, { count: number; totalWeight: number; totalValue: number }>();
  let totalWeight = 0;
  let totalFees = 0;

  const txRows = transactions.map((tx) => {
    const weight = tx.goldWeightFine ? Number(tx.goldWeightFine) : 0;
    const lme = tx.lmePriceLocked ? Number(tx.lmePriceLocked) : 0;
    const value = (weight / 31.1035) * lme;
    const fee = tx.settlement?.companyFeeUsd ? Number(tx.settlement.companyFeeUsd) : 0;

    totalWeight += weight;
    totalFees += fee;

    const existing = countryMap.get(tx.countryCode) ?? { count: 0, totalWeight: 0, totalValue: 0 };
    existing.count += 1;
    existing.totalWeight += weight;
    existing.totalValue += value;
    countryMap.set(tx.countryCode, existing);

    return {
      id: tx.id,
      clientName: tx.client.fullName,
      countryCode: tx.countryCode,
      weight: weight.toFixed(3),
      value: value.toFixed(2),
      phase: tx.phase,
      status: tx.status,
    };
  });

  const byCountry = Array.from(countryMap.entries()).map(([countryCode, data]) => ({
    countryCode,
    count: data.count,
    totalWeight: data.totalWeight.toFixed(3),
    totalValue: data.totalValue.toFixed(2),
  }));

  const context: Record<string, unknown> = {
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    totalCount: transactions.length,
    totalWeight: totalWeight.toFixed(3),
    totalFees: totalFees.toFixed(2),
    byCountry,
    transactions: txRows,
  };

  const pdfBuffer = await renderPdf(TEMPLATE, context);
  const key = `reports/monthly/${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}/${Date.now()}.pdf`;
  const result = await uploadToS3(key, pdfBuffer, 'application/pdf');

  logger.info(
    { periodStart, periodEnd, storageKey: result.storageKey },
    'Transaction activity report generated',
  );
  return result;
}
