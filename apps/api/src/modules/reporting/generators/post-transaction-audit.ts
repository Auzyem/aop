import { prisma } from '@aop/db';
import { NotFoundError } from '@aop/utils';
import { logger } from '@aop/utils';
import { uploadToS3 } from '../../../lib/s3.js';
import { renderPdf } from './base.js';

const AUDIT_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Post-Transaction Audit Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; }
    h2 { color: #16213e; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { background: #1a1a2e; color: white; padding: 8px; text-align: left; }
    td { border: 1px solid #ddd; padding: 8px; }
    tr:nth-child(even) { background: #f9f9f9; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .status-ok { background: #d4edda; color: #155724; }
    .status-warn { background: #fff3cd; color: #856404; }
    .status-fail { background: #f8d7da; color: #721c24; }
    .section { margin-bottom: 32px; }
    .meta { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Post-Transaction Audit Report</h1>
  <div class="meta">
    <p><strong>Transaction ID:</strong> {{transactionId}}</p>
    <p><strong>Generated At:</strong> {{generatedAt}}</p>
    <p><strong>Client:</strong> {{clientName}}</p>
    <p><strong>Agent:</strong> {{agentName}}</p>
    <p><strong>Country:</strong> {{countryCode}}</p>
    <p><strong>Current Phase:</strong> {{phase}} | <strong>Status:</strong> {{status}}</p>
  </div>

  <div class="section">
    <h2>1. Overview</h2>
    <table>
      <tr><th>Field</th><th>Value</th></tr>
      <tr><td>Gold Weight (Gross)</td><td>{{goldWeightGross}} g</td></tr>
      <tr><td>Gold Weight (Fine)</td><td>{{goldWeightFine}} g</td></tr>
      <tr><td>LME Price Locked</td><td>{{lmePriceLocked}}</td></tr>
      <tr><td>Created At</td><td>{{createdAt}}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>2. Phase Timeline</h2>
    <table>
      <tr><th>Phase</th><th>Entered At</th><th>Exited At</th><th>Duration</th><th>SLA Breach</th></tr>
      {{#each phaseHistory}}
      <tr>
        <td>{{this.phase}}</td>
        <td>{{this.enteredAt}}</td>
        <td>{{this.exitedAt}}</td>
        <td>{{this.duration}}</td>
        <td><span class="badge {{#if this.slaBreach}}status-fail{{else}}status-ok{{/if}}">{{#if this.slaBreach}}BREACH{{else}}OK{{/if}}</span></td>
      </tr>
      {{/each}}
    </table>
  </div>

  <div class="section">
    <h2>3. Documents</h2>
    <table>
      <tr><th>Type</th><th>Uploaded At</th><th>Approval Status</th></tr>
      {{#each documents}}
      <tr>
        <td>{{this.documentType}}</td>
        <td>{{this.uploadedAt}}</td>
        <td><span class="badge {{#if (eq this.approvalStatus 'APPROVED')}}status-ok{{else if (eq this.approvalStatus 'REJECTED')}}status-fail{{else}}status-warn{{/if}}">{{this.approvalStatus}}</span></td>
      </tr>
      {{/each}}
    </table>
  </div>

  <div class="section">
    <h2>4. Cost Breakdown</h2>
    <table>
      <tr><th>Category</th><th>Estimated (USD)</th><th>Actual (USD)</th></tr>
      {{#each costItems}}
      <tr>
        <td>{{this.category}}</td>
        <td>{{this.estimatedUsd}}</td>
        <td>{{this.actualUsd}}</td>
      </tr>
      {{/each}}
      <tr>
        <td><strong>Total</strong></td>
        <td><strong>{{totalEstimated}}</strong></td>
        <td><strong>{{totalActual}}</strong></td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>5. Settlement Calculation Detail</h2>
    {{#if settlement}}
    <table>
      <tr><th>Field</th><th>Value (USD)</th></tr>
      <tr><td>Gross Proceeds</td><td>{{settlement.grossProceedsUsd}}</td></tr>
      <tr><td>Company Fee</td><td>{{settlement.companyFeeUsd}}</td></tr>
      <tr><td>Net Remittance</td><td>{{settlement.netRemittanceUsd}}</td></tr>
      <tr><td>Approved At</td><td>{{settlement.approvedAt}}</td></tr>
    </table>
    {{else}}
    <p>No settlement recorded for this transaction.</p>
    {{/if}}
  </div>

  <div class="section">
    <h2>6. Exceptions</h2>
    {{#if exceptions.length}}
    <table>
      <tr><th>Type</th><th>Description</th></tr>
      {{#each exceptions}}
      <tr>
        <td>{{this.type}}</td>
        <td>{{this.description}}</td>
      </tr>
      {{/each}}
    </table>
    {{else}}
    <p>No exceptions recorded.</p>
    {{/if}}
  </div>
</body>
</html>
`;

export async function generatePostTransactionAudit(
  txnId: string,
): Promise<{ storageKey: string; url: string }> {
  const tx = await prisma.transaction.findUnique({
    where: { id: txnId },
    include: {
      client: true,
      agent: true,
      phaseHistory: { orderBy: { enteredAt: 'asc' } },
      documents: { where: { isDeleted: false }, orderBy: { uploadedAt: 'asc' } },
      costItems: { orderBy: { category: 'asc' } },
      settlement: true,
    },
  });

  if (!tx) throw new NotFoundError('Transaction', txnId);

  // Build phase timeline
  const phaseHistory = tx.phaseHistory.map((ph) => {
    const enteredAt = ph.enteredAt;
    const exitedAt = ph.exitedAt;
    let duration = '-';
    if (exitedAt) {
      const ms = exitedAt.getTime() - enteredAt.getTime();
      const days = Math.floor(ms / 86_400_000);
      const hours = Math.floor((ms % 86_400_000) / 3_600_000);
      duration = `${days}d ${hours}h`;
    }
    return {
      phase: ph.phase,
      enteredAt: enteredAt.toISOString(),
      exitedAt: exitedAt ? exitedAt.toISOString() : 'In progress',
      duration,
      slaBreach: ph.slaBreach,
    };
  });

  // Cost summary
  const totalEstimated = tx.costItems.reduce(
    (s, c) => s + (c.estimatedUsd ? Number(c.estimatedUsd) : 0),
    0,
  );
  const totalActual = tx.costItems.reduce((s, c) => s + (c.actualUsd ? Number(c.actualUsd) : 0), 0);

  // Exceptions
  const exceptions: Array<{ type: string; description: string }> = [];
  const slaBreaches = tx.phaseHistory.filter((ph) => ph.slaBreach);
  for (const ph of slaBreaches) {
    exceptions.push({ type: 'SLA_BREACH', description: `SLA exceeded in ${ph.phase}` });
  }
  const rejectedDocs = tx.documents.filter((d) => d.approvalStatus === 'REJECTED');
  for (const doc of rejectedDocs) {
    exceptions.push({ type: 'REJECTED_DOCUMENT', description: `${doc.documentType} rejected` });
  }

  const context: Record<string, unknown> = {
    transactionId: txnId,
    generatedAt: new Date().toISOString(),
    clientName: tx.client.fullName,
    agentName: tx.agent.companyName,
    countryCode: tx.countryCode,
    phase: tx.phase,
    status: tx.status,
    goldWeightGross: tx.goldWeightGross ? Number(tx.goldWeightGross).toFixed(3) : '-',
    goldWeightFine: tx.goldWeightFine ? Number(tx.goldWeightFine).toFixed(3) : '-',
    lmePriceLocked: tx.lmePriceLocked ? `$${Number(tx.lmePriceLocked).toFixed(2)}` : '-',
    createdAt: tx.createdAt.toISOString(),
    phaseHistory,
    documents: tx.documents.map((d) => ({
      documentType: d.documentType,
      uploadedAt: d.uploadedAt.toISOString(),
      approvalStatus: d.approvalStatus,
    })),
    costItems: tx.costItems.map((c) => ({
      category: c.category,
      estimatedUsd: c.estimatedUsd ? `$${Number(c.estimatedUsd).toFixed(2)}` : '-',
      actualUsd: c.actualUsd ? `$${Number(c.actualUsd).toFixed(2)}` : '-',
    })),
    totalEstimated: `$${totalEstimated.toFixed(2)}`,
    totalActual: `$${totalActual.toFixed(2)}`,
    settlement: tx.settlement
      ? {
          grossProceedsUsd: `$${Number(tx.settlement.grossProceedsUsd).toFixed(2)}`,
          companyFeeUsd: `$${Number(tx.settlement.companyFeeUsd).toFixed(2)}`,
          netRemittanceUsd: `$${Number(tx.settlement.netRemittanceUsd).toFixed(2)}`,
          approvedAt: tx.settlement.approvedAt ? tx.settlement.approvedAt.toISOString() : '-',
        }
      : null,
    exceptions,
  };

  const pdfBuffer = await renderPdf(AUDIT_TEMPLATE, context);
  const key = `reports/audit/${txnId}/${Date.now()}.pdf`;
  const result = await uploadToS3(key, pdfBuffer, 'application/pdf');

  logger.info({ txnId, storageKey: result.storageKey }, 'Post-transaction audit PDF generated');
  return result;
}
