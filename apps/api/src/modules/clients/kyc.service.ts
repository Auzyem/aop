import { prisma } from '@aop/db';
import { NotFoundError, ValidationError } from '@aop/utils';
import type { KycDocumentType, EntityType } from '@aop/db';
import { sendMail } from '../../lib/mailer.js';

// ---------------------------------------------------------------------------
// Mandatory document types per entity type
// ---------------------------------------------------------------------------

const MANDATORY_DOCS: Record<EntityType, KycDocumentType[]> = {
  INDIVIDUAL: ['NATIONAL_ID', 'PROOF_OF_ADDRESS', 'SOURCE_OF_FUNDS'],
  COMPANY: ['BUSINESS_REGISTRATION', 'DIRECTOR_ID', 'SOURCE_OF_FUNDS', 'TAX_CERTIFICATE'],
  COOP: ['BUSINESS_REGISTRATION', 'BENEFICIAL_OWNER_DECLARATION', 'SOURCE_OF_FUNDS'],
};

// ---------------------------------------------------------------------------
// KYC summary / status
// ---------------------------------------------------------------------------

export async function getKycStatus(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      kycRecords: {
        orderBy: { uploadedAt: 'desc' },
        include: { uploadedByUser: { select: { id: true, email: true } } },
      },
    },
  });
  if (!client) throw new NotFoundError('Client', clientId);

  const mandatory = MANDATORY_DOCS[client.entityType] ?? [];
  const approvedTypes = new Set(
    client.kycRecords.filter((r) => r.status === 'APPROVED').map((r) => r.documentType),
  );
  const missingDocs = mandatory.filter((t) => !approvedTypes.has(t));

  return {
    kycStatus: client.kycStatus,
    sanctionsStatus: client.sanctionsStatus,
    isPEP: client.isPEP,
    isEDD: client.isEDD,
    mandatoryDocs: mandatory,
    missingDocs,
    documents: client.kycRecords,
  };
}

// ---------------------------------------------------------------------------
// Individual document approve / reject
// ---------------------------------------------------------------------------

export async function approveKycDocument(docId: string, approverId: string) {
  const record = await prisma.kycRecord.findUnique({ where: { id: docId } });
  if (!record) throw new NotFoundError('KYC document', docId);

  const approvedAt = new Date();
  const retainUntil = new Date(approvedAt);
  retainUntil.setFullYear(retainUntil.getFullYear() + 2); // 2-year validity

  return prisma.kycRecord.update({
    where: { id: docId },
    data: {
      status: 'APPROVED',
      approvedBy: approverId,
      approvedAt,
      retainUntil,
      rejectionReason: null,
    },
  });
}

export async function rejectKycDocument(docId: string, approverId: string, reason: string) {
  const record = await prisma.kycRecord.findUnique({ where: { id: docId } });
  if (!record) throw new NotFoundError('KYC document', docId);

  return prisma.kycRecord.update({
    where: { id: docId },
    data: {
      status: 'REJECTED',
      approvedBy: approverId,
      approvedAt: new Date(),
      rejectionReason: reason,
    },
  });
}

// ---------------------------------------------------------------------------
// Full KYC approval / rejection
// ---------------------------------------------------------------------------

export async function approveFullKyc(clientId: string, _approverId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { kycRecords: true },
  });
  if (!client) throw new NotFoundError('Client', clientId);

  // Guard 1: No HIT sanctions
  if (client.sanctionsStatus === 'HIT') {
    throw new ValidationError(
      'KYC cannot be approved — client has a sanctions HIT. Review must be completed.',
    );
  }

  // Guard 2: PEP requires EDD
  if (client.isPEP && !client.isEDD) {
    throw new ValidationError(
      'KYC cannot be approved — client is a PEP but Enhanced Due Diligence is not complete.',
    );
  }

  // Guard 3: All mandatory docs must be APPROVED
  const mandatory = MANDATORY_DOCS[client.entityType] ?? [];
  const approvedTypes = new Set(
    client.kycRecords.filter((r) => r.status === 'APPROVED').map((r) => r.documentType),
  );
  const missing = mandatory.filter((t) => !approvedTypes.has(t));
  if (missing.length > 0) {
    throw new ValidationError(
      `KYC cannot be approved — missing approved documents: ${missing.join(', ')}`,
      { missingDocuments: missing },
    );
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { kycStatus: 'APPROVED' },
  });

  // Notify compliance team (fire-and-forget)
  notifyComplianceKycApproved(client.fullName, clientId).catch(() => {});

  return updated;
}

export async function rejectFullKyc(clientId: string, _approverId: string, _reason: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new NotFoundError('Client', clientId);

  return prisma.client.update({
    where: { id: clientId },
    data: { kycStatus: 'REJECTED' },
  });
}

// ---------------------------------------------------------------------------
// Email notifications
// ---------------------------------------------------------------------------

async function notifyComplianceKycApproved(clientName: string, clientId: string) {
  const complianceUsers = await prisma.user.findMany({
    where: { role: 'COMPLIANCE_OFFICER', isActive: true },
    select: { email: true },
  });

  if (complianceUsers.length === 0) return;

  await sendMail({
    to: complianceUsers.map((u) => u.email),
    subject: `[AOP] KYC Approved — ${clientName}`,
    text: `The KYC application for client "${clientName}" (ID: ${clientId}) has been approved.`,
  });
}
