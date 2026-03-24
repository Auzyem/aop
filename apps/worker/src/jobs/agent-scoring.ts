import { prisma } from '@aop/db';
import { logger } from '@aop/utils';

export const AGENT_SCORING_CRON = '0 1 * * *'; // 01:00 UTC daily

export async function agentScoringProcessor(_job: unknown): Promise<void> {
  const agents = await prisma.agent.findMany({ where: { isActive: true } });

  for (const agent of agents) {
    // docAccuracyScore: % of docs uploaded by this agent's transactions that were NOT rejected
    const totalDocs = await prisma.document.count({
      where: { transaction: { agentId: agent.id } },
    });
    const rejectedDocs = await prisma.document.count({
      where: { transaction: { agentId: agent.id }, approvalStatus: 'REJECTED' },
    });
    const docAccuracy = totalDocs > 0 ? (totalDocs - rejectedDocs) / totalDocs : 1.0;

    // avgPhaseCompletionDays: average days to complete Phase 4 (PHASE_4 entry to PHASE_5 entry)
    const phase4Histories = await prisma.phaseHistory.findMany({
      where: { transaction: { agentId: agent.id }, phase: 'PHASE_4', exitedAt: { not: null } },
    });
    const avgDays =
      phase4Histories.length > 0
        ? phase4Histories.reduce(
            (sum, h) => sum + (h.exitedAt!.getTime() - h.enteredAt.getTime()) / 86400000,
            0,
          ) / phase4Histories.length
        : null;

    // complianceScore: 100 - (10 * overdue_items) - (20 * compliance_incidents)
    // overdue: disbursements sent > 48h ago with no APPROVED receipt
    const now = new Date();
    const threshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const overdueCount = await prisma.disbursement.count({
      where: {
        agentId: agent.id,
        status: 'SENT',
        sentAt: { lt: threshold },
        receipts: { none: { status: 'APPROVED' } },
      },
    });
    const complianceScore = Math.max(0, 100 - 10 * overdueCount);

    // performanceScore = docAccuracy*40 + (complianceScore/100)*40 + (1 if avgDays<=5 else 0.5)*20
    const timeScore = avgDays == null ? 50 : avgDays <= 5 ? 100 : 50;
    const performanceScore =
      docAccuracy * 40 + (complianceScore / 100) * 40 + (timeScore / 100) * 20;

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        docAccuracyScore: docAccuracy,
        avgPhaseCompletionDays: avgDays,
        complianceScore,
        performanceScore,
        performanceScoredAt: now,
      },
    });
  }

  logger.info({ count: agents.length }, 'Agent scoring complete');
}
