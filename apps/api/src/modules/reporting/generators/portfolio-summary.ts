import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { uploadToS3 } from '../../../lib/s3.js';
import { renderPdf } from './base.js';

const TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Weekly Portfolio Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; }
    h2 { color: #16213e; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { background: #1a1a2e; color: white; padding: 8px; text-align: left; }
    td { border: 1px solid #ddd; padding: 8px; }
    tr:nth-child(even) { background: #f9f9f9; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 16px 0; }
    .metric { background: #f0f4f8; border-left: 4px solid #1a1a2e; padding: 16px; }
    .metric-value { font-size: 24px; font-weight: bold; color: #1a1a2e; }
    .metric-label { font-size: 12px; color: #666; margin-top: 4px; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 4px; font-size: 11px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Weekly Portfolio Summary</h1>
  <p><strong>Period:</strong> {{periodStart}} to {{periodEnd}}</p>
  <p><strong>Generated:</strong> {{generatedAt}}</p>

  <h2>Executive Summary</h2>
  <div class="summary-grid">
    <div class="metric">
      <div class="metric-value">{{totalCount}}</div>
      <div class="metric-label">Total Transactions</div>
    </div>
    <div class="metric">
      <div class="metric-value">{{totalGoldWeight}} g</div>
      <div class="metric-label">Total Gold Weight (Fine)</div>
    </div>
    <div class="metric">
      <div class="metric-value">USD {{totalLmeValue}}</div>
      <div class="metric-label">Total LME Value</div>
    </div>
  </div>

  <h2>Phase Distribution</h2>
  <pre>{{phaseDistributionJson}}</pre>

  <h2>Agent Performance</h2>
  <table>
    <tr>
      <th>Agent</th>
      <th>Transactions</th>
      <th>Avg Time Phase 1 (days)</th>
      <th>Avg Time Phase 2 (days)</th>
    </tr>
    {{#each agentPerformance}}
    <tr>
      <td>{{this.companyName}}</td>
      <td>{{this.txCount}}</td>
      <td>{{this.avgPhase1Days}}</td>
      <td>{{this.avgPhase2Days}}</td>
    </tr>
    {{/each}}
  </table>
</body>
</html>
`;

export async function generatePortfolioSummary(
  periodStart: Date,
  periodEnd: Date,
): Promise<{ storageKey: string; url: string }> {
  const transactions = await prisma.transaction.findMany({
    where: { createdAt: { gte: periodStart, lte: periodEnd } },
    select: {
      id: true,
      phase: true,
      goldWeightFine: true,
      lmePriceLocked: true,
      agent: { select: { id: true, companyName: true } },
      phaseHistory: {
        select: { phase: true, enteredAt: true, exitedAt: true },
        orderBy: { enteredAt: 'asc' },
      },
    },
  });

  // Aggregate metrics
  let totalGoldWeight = 0;
  let totalLmeValue = 0;
  const phaseDistribution: Record<string, number> = {};
  const agentMap = new Map<
    string,
    {
      companyName: string;
      txCount: number;
      phase1DurationsMs: number[];
      phase2DurationsMs: number[];
    }
  >();

  for (const tx of transactions) {
    const weight = tx.goldWeightFine ? Number(tx.goldWeightFine) : 0;
    const lme = tx.lmePriceLocked ? Number(tx.lmePriceLocked) : 0;
    totalGoldWeight += weight;
    totalLmeValue += (weight / 31.1035) * lme;

    phaseDistribution[tx.phase] = (phaseDistribution[tx.phase] ?? 0) + 1;

    const agentId = tx.agent.id;
    const existing = agentMap.get(agentId) ?? {
      companyName: tx.agent.companyName,
      txCount: 0,
      phase1DurationsMs: [],
      phase2DurationsMs: [],
    };
    existing.txCount += 1;

    for (const ph of tx.phaseHistory) {
      if (ph.exitedAt) {
        const dur = ph.exitedAt.getTime() - ph.enteredAt.getTime();
        if (ph.phase === 'PHASE_1') existing.phase1DurationsMs.push(dur);
        if (ph.phase === 'PHASE_2') existing.phase2DurationsMs.push(dur);
      }
    }

    agentMap.set(agentId, existing);
  }

  const avg = (arr: number[]): string => {
    if (arr.length === 0) return '-';
    const avgMs = arr.reduce((a, b) => a + b, 0) / arr.length;
    return (avgMs / 86_400_000).toFixed(1);
  };

  const agentPerformance = Array.from(agentMap.values()).map((a) => ({
    companyName: a.companyName,
    txCount: a.txCount,
    avgPhase1Days: avg(a.phase1DurationsMs),
    avgPhase2Days: avg(a.phase2DurationsMs),
  }));

  const context: Record<string, unknown> = {
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    totalCount: transactions.length,
    totalGoldWeight: totalGoldWeight.toFixed(3),
    totalLmeValue: totalLmeValue.toFixed(2),
    phaseDistributionJson: JSON.stringify(phaseDistribution, null, 2),
    agentPerformance,
  };

  const pdfBuffer = await renderPdf(TEMPLATE, context);
  const key = `reports/portfolio/${periodStart.toISOString().split('T')[0]}/${Date.now()}.pdf`;
  const result = await uploadToS3(key, pdfBuffer, 'application/pdf');

  logger.info(
    { periodStart, periodEnd, storageKey: result.storageKey },
    'Portfolio summary report generated',
  );
  return result;
}
