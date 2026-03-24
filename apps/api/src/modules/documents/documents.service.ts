import { prisma } from '@aop/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';
import { getSignedDownloadUrl } from '../../lib/s3.js';
import { buildChecklist } from './document-checklist.service.js';
import type { ListDocumentsQuery, RejectDocDto } from './documents.schemas.js';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listDocuments(query: ListDocumentsQuery, actor: AuthenticatedUser) {
  const { transactionId, clientId, documentType, approvalStatus, page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    isDeleted: false,
    ...(transactionId ? { transactionId } : {}),
    ...(clientId ? { clientId } : {}),
    ...(documentType ? { documentType } : {}),
    ...(approvalStatus ? { approvalStatus } : {}),
    // OPERATIONS agents only see their own scope
    ...(actor.role === 'OPERATIONS' && actor.agentId
      ? { transaction: { agentId: actor.agentId } }
      : {}),
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take: limit,
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        transactionId: true,
        clientId: true,
        documentType: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        uploadedAt: true,
        approvalStatus: true,
        isSystemGenerated: true,
        version: true,
      },
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total, page, limit };
}

// ---------------------------------------------------------------------------
// Get one
// ---------------------------------------------------------------------------

export async function getDocumentById(id: string, _actor: AuthenticatedUser) {
  const doc = await prisma.document.findUnique({
    where: { id, isDeleted: false },
    include: {
      uploadedByUser: { select: { id: true, email: true } },
      approvedByUser: { select: { id: true, email: true } },
    },
  });
  if (!doc) throw new NotFoundError('Document not found');
  return doc;
}

// ---------------------------------------------------------------------------
// Download signed URL
// ---------------------------------------------------------------------------

export async function getDownloadUrl(id: string, _actor: AuthenticatedUser): Promise<string> {
  const doc = await prisma.document.findUnique({ where: { id, isDeleted: false } });
  if (!doc) throw new NotFoundError('Document not found');
  return getSignedDownloadUrl(doc.storageKey, 900); // 15 min
}

// ---------------------------------------------------------------------------
// Approve / reject
// ---------------------------------------------------------------------------

export async function approveDocument(id: string, approverId: string) {
  const doc = await prisma.document.findUnique({ where: { id, isDeleted: false } });
  if (!doc) throw new NotFoundError('Document not found');
  if (doc.isSystemGenerated)
    throw new ValidationError('System-generated documents cannot be manually approved');
  if (doc.approvalStatus === 'APPROVED') throw new ValidationError('Document already approved');

  return prisma.document.update({
    where: { id },
    data: { approvalStatus: 'APPROVED', approvedBy: approverId, approvedAt: new Date() },
  });
}

export async function rejectDocument(id: string, approverId: string, dto: RejectDocDto) {
  const doc = await prisma.document.findUnique({ where: { id, isDeleted: false } });
  if (!doc) throw new NotFoundError('Document not found');
  if (doc.isSystemGenerated)
    throw new ValidationError('System-generated documents cannot be rejected');
  if (doc.approvalStatus === 'APPROVED')
    throw new ValidationError('Cannot reject an already approved document');

  return prisma.document.update({
    where: { id },
    data: {
      approvalStatus: 'REJECTED',
      approvedBy: approverId,
      approvedAt: new Date(),
      rejectionReason: dto.reason,
    },
  });
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export async function getTransactionChecklist(transactionId: string, _actor: AuthenticatedUser) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      phase: true,
      documents: {
        where: { isDeleted: false },
        select: { id: true, documentType: true, approvalStatus: true },
      },
    },
  });
  if (!tx) throw new NotFoundError('Transaction not found');
  return buildChecklist(tx.phase, tx.documents);
}

// ---------------------------------------------------------------------------
// Delete — always forbidden
// ---------------------------------------------------------------------------

export function deleteDocument(): never {
  throw new ForbiddenError('Document deletion is prohibited — records are retained for compliance');
}
