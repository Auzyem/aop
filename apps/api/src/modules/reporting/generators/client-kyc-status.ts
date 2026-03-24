import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import { uploadToS3 } from '../../../lib/s3.js';
import { renderPdf } from './base.js';

const TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Client KYC Status Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; }
    h2 { color: #16213e; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    th { background: #1a1a2e; color: white; padding: 6px; text-align: left; }
    td { border: 1px solid #ddd; padding: 6px; }
    tr:nth-child(even) { background: #f9f9f9; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; }
    .ok { background: #d4edda; color: #155724; }
    .warn { background: #fff3cd; color: #856404; }
    .fail { background: #f8d7da; color: #721c24; }
    .summary-box { background: #f0f4f8; border-left: 4px solid #1a1a2e; padding: 12px; margin: 12px 0; }
  </style>
</head>
<body>
  <h1>Client KYC Status Report</h1>
  <p><strong>Generated:</strong> {{generatedAt}}</p>

  <div class="summary-box">
    <p>Total Clients: <strong>{{totalClients}}</strong></p>
    <p>Expired Documents: <strong>{{expiredCount}}</strong></p>
    <p>Upcoming Renewals (30 days): <strong>{{upcomingCount}}</strong></p>
    <p>PEP Flagged: <strong>{{pepCount}}</strong></p>
    <p>EDD Flagged: <strong>{{eddCount}}</strong></p>
  </div>

  <h2>Client KYC Status</h2>
  <table>
    <tr>
      <th>Name</th>
      <th>Entity Type</th>
      <th>Country</th>
      <th>KYC Status</th>
      <th>Sanctions</th>
      <th>Risk</th>
      <th>PEP</th>
      <th>EDD</th>
      <th>Expired Docs</th>
      <th>Upcoming Renewals</th>
    </tr>
    {{#each clients}}
    <tr>
      <td>{{this.fullName}}</td>
      <td>{{this.entityType}}</td>
      <td>{{this.countryCode}}</td>
      <td><span class="badge {{this.kycBadge}}">{{this.kycStatus}}</span></td>
      <td><span class="badge {{this.sanctionsBadge}}">{{this.sanctionsStatus}}</span></td>
      <td><span class="badge {{this.riskBadge}}">{{this.riskRating}}</span></td>
      <td>{{#if this.isPEP}}<span class="badge fail">YES</span>{{else}}<span class="badge ok">NO</span>{{/if}}</td>
      <td>{{#if this.isEDD}}<span class="badge warn">YES</span>{{else}}<span class="badge ok">NO</span>{{/if}}</td>
      <td>{{this.expiredDocs}}</td>
      <td>{{this.upcomingRenewals}}</td>
    </tr>
    {{/each}}
  </table>
</body>
</html>
`;

export async function generateClientKycStatus(): Promise<{ storageKey: string; url: string }> {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 86_400_000);

  const clients = await prisma.client.findMany({
    include: {
      kycRecords: {
        select: { id: true, retainUntil: true, documentType: true },
      },
    },
    orderBy: { fullName: 'asc' },
  });

  let expiredCount = 0;
  let upcomingCount = 0;
  let pepCount = 0;
  let eddCount = 0;

  const clientRows = clients.map((c) => {
    const expiredDocs = c.kycRecords.filter(
      (r) => r.retainUntil && new Date(r.retainUntil) < now,
    ).length;
    const upcomingRenewals = c.kycRecords.filter(
      (r) =>
        r.retainUntil && new Date(r.retainUntil) >= now && new Date(r.retainUntil) < thirtyDaysOut,
    ).length;

    expiredCount += expiredDocs > 0 ? 1 : 0;
    upcomingCount += upcomingRenewals > 0 ? 1 : 0;
    if (c.isPEP) pepCount++;
    if (c.isEDD) eddCount++;

    const kycBadge =
      c.kycStatus === 'APPROVED' ? 'ok' : c.kycStatus === 'REJECTED' ? 'fail' : 'warn';
    const sanctionsBadge =
      c.sanctionsStatus === 'CLEAR' ? 'ok' : c.sanctionsStatus === 'HIT' ? 'fail' : 'warn';
    const riskBadge =
      c.riskRating === 'LOW'
        ? 'ok'
        : c.riskRating === 'HIGH' || c.riskRating === 'VERY_HIGH'
          ? 'fail'
          : 'warn';

    return {
      fullName: c.fullName,
      entityType: c.entityType,
      countryCode: c.countryCode,
      kycStatus: c.kycStatus,
      sanctionsStatus: c.sanctionsStatus,
      riskRating: c.riskRating,
      isPEP: c.isPEP,
      isEDD: c.isEDD,
      expiredDocs,
      upcomingRenewals,
      kycBadge,
      sanctionsBadge,
      riskBadge,
    };
  });

  const context: Record<string, unknown> = {
    generatedAt: now.toISOString(),
    totalClients: clients.length,
    expiredCount,
    upcomingCount,
    pepCount,
    eddCount,
    clients: clientRows,
  };

  const pdfBuffer = await renderPdf(TEMPLATE, context);
  const key = `reports/kyc-status/${Date.now()}.pdf`;
  const result = await uploadToS3(key, pdfBuffer, 'application/pdf');

  logger.info(
    { totalClients: clients.length, storageKey: result.storageKey },
    'Client KYC status report generated',
  );
  return result;
}
