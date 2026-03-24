import { prisma } from '@aop/db';
import { NotFoundError } from '@aop/utils';
import { logger } from '@aop/utils';
import { getSanctionsProvider } from '../../lib/integrations/sanctions/factory.js';
import { sendTemplatedEmail } from '../../lib/integrations/email/email.service.js';
import type { EntityType } from '@aop/db';

// ---------------------------------------------------------------------------
// ComplyAdvantage entity type mapping
// ---------------------------------------------------------------------------

function mapEntityType(entityType: EntityType): 'person' | 'company' {
  switch (entityType) {
    case 'INDIVIDUAL':
      return 'person';
    case 'COMPANY':
    case 'COOP':
      return 'company';
    default:
      return 'person';
  }
}

// ---------------------------------------------------------------------------
// Screen single client
// ---------------------------------------------------------------------------

export async function screenClient(clientId: string, screenedById: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new NotFoundError('Client', clientId);

  const provider = getSanctionsProvider();

  const result = await provider.search({
    name: client.fullName,
    entityType: mapEntityType(client.entityType),
    countryCode: client.countryCode,
  });

  // Persist screening record
  const screening = await prisma.sanctionsScreening.create({
    data: {
      clientId,
      provider: result.provider,
      rawResult: result.rawResult as never,
      outcome: result.outcome,
      screenedBy: screenedById,
    },
  });

  // Update client sanctions status
  const clientUpdate: Parameters<typeof prisma.client.update>[0]['data'] = {
    sanctionsStatus: result.outcome,
  };
  if (result.outcome === 'HIT') {
    clientUpdate.kycStatus = 'REJECTED';
  }
  await prisma.client.update({ where: { id: clientId }, data: clientUpdate });

  // Notify compliance team on HIT (fire-and-forget)
  if (result.outcome === 'HIT') {
    notifyComplianceSanctionsHit(client.fullName, clientId).catch(() => {});
  }

  return screening;
}

// ---------------------------------------------------------------------------
// Batch re-screen all active clients
// ---------------------------------------------------------------------------

export async function batchScreenAll(screenedById: string) {
  const clients = await prisma.client.findMany({
    where: {},
    select: { id: true },
  });

  const results = await Promise.allSettled(clients.map((c) => screenClient(c.id, screenedById)));

  let screened = 0;
  let hits = 0;
  let errors = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      screened++;
      if (result.value.outcome === 'HIT') hits++;
    } else {
      errors++;
      logger.error({ err: result.reason }, 'Batch screening: client failed');
    }
  }

  logger.info({ screened, hits, errors }, 'Batch sanctions screening complete');
  return { screened, hits, errors };
}

// ---------------------------------------------------------------------------
// Email notification — uses templated email service
// ---------------------------------------------------------------------------

async function notifyComplianceSanctionsHit(clientName: string, clientId: string) {
  const complianceUsers = await prisma.user.findMany({
    where: { role: 'COMPLIANCE_OFFICER', isActive: true },
    select: { email: true },
  });

  if (complianceUsers.length === 0) return;

  await sendTemplatedEmail(
    'sanctions-hit',
    {
      clientName,
      clientId,
      screenedAt: new Date().toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC',
    },
    {
      to: complianceUsers.map((u) => u.email),
      subject: `[AOP] COMPLIANCE ALERT — Sanctions Hit on ${clientName}`,
    },
  );
}
