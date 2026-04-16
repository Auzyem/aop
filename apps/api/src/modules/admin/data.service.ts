/**
 * GDPR / POPIA data management service.
 *
 * Handles data subject access requests (DSAR) and deletion requests.
 *
 * Key constraints:
 *  - AML/FATF/FAIS regulations require ALL transactional data to be retained
 *    for a minimum of 10 years. Auto-deletion of transactional data is
 *    prohibited. Only anonymisation of non-transactional PII (e.g., test
 *    accounts) may be considered on a case-by-case basis by COMPLIANCE_OFFICER.
 *  - Every DSAR export and deletion request is written to the audit log.
 */

import { prisma } from '@aop/db';
import { logger } from '@aop/utils';
import type { User } from '@aop/db';

// ---------------------------------------------------------------------------
// Data subject access request — export all personal data for a client
// ---------------------------------------------------------------------------

export async function exportSubjectData(clientId: string, requestedBy: User) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      kycRecords: {
        select: {
          id: true,
          status: true,
          uploadedAt: true,
          approvedAt: true,
        },
      },
      sanctionsScreenings: {
        select: {
          id: true,
          outcome: true,
          screenedAt: true,
          provider: true,
        },
      },
      transactions: {
        select: {
          id: true,
          phase: true,
          goldWeightGross: true,
          assayPurity: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      documents: {
        select: {
          id: true,
          documentType: true,
          filename: true,
          uploadedAt: true,
          approvalStatus: true,
          retainUntil: true,
          isDeleted: true,
        },
      },
      assignedAgent: {
        select: { id: true, companyName: true, countryCode: true },
      },
    },
  });

  if (!client) {
    const err = new Error('Client not found');
    (err as any).statusCode = 404;
    throw err;
  }

  logger.info(
    { clientId, requestedBy: requestedBy.id },
    'GDPR DSAR: subject data export requested',
  );

  return {
    exportedAt: new Date().toISOString(),
    requestedBy: requestedBy.id,
    dataSubject: {
      id: client.id,
      fullName: client.fullName,
      entityType: client.entityType,
      countryCode: client.countryCode,
      nationalId: client.nationalId,
      miningLicenceNo: client.miningLicenceNo,
      businessRegNo: client.businessRegNo,
      mobilePhone: client.mobilePhone,
      smsOptIn: client.smsOptIn,
      kycStatus: client.kycStatus,
      sanctionsStatus: client.sanctionsStatus,
      riskRating: client.riskRating,
      isPEP: client.isPEP,
      isEDD: client.isEDD,
      createdAt: client.createdAt,
      deletionRequestedAt: client.deletionRequestedAt,
    },
    assignedAgent: client.assignedAgent,
    kycRecords: client.kycRecords,
    sanctionsScreenings: client.sanctionsScreenings,
    transactions: client.transactions,
    documents: client.documents,
    retentionNote:
      'All transactional data is retained for a minimum of 10 years under AML/FATF and FAIS regulations. ' +
      'This data cannot be deleted until the retention period expires and a Compliance Officer has reviewed and approved deletion.',
  };
}

// ---------------------------------------------------------------------------
// Deletion request — logs the request, does NOT delete data
// ---------------------------------------------------------------------------

export async function requestDeletion(clientId: string, reason: string, requestedBy: User) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      fullName: true,
      deletionRequestedAt: true,
      transactions: { select: { id: true }, take: 1 },
    },
  });

  if (!client) {
    const err = new Error('Client not found');
    (err as any).statusCode = 404;
    throw err;
  }

  const hasTransactions = client.transactions.length > 0;

  // Mark the deletion request timestamp (idempotent — only set once)
  if (!client.deletionRequestedAt) {
    await prisma.client.update({
      where: { id: clientId },
      data: { deletionRequestedAt: new Date() },
    });
  }

  logger.info(
    { clientId, requestedBy: requestedBy.id, hasTransactions, reason },
    'GDPR deletion request logged',
  );

  return {
    clientId,
    deletionRequestedAt: client.deletionRequestedAt ?? new Date(),
    hasTransactionalData: hasTransactions,
    message: hasTransactions
      ? 'Deletion request logged. This client has transactional records which are subject to a mandatory ' +
        '10-year AML/FATF retention period. Immediate deletion is not possible. A Compliance Officer will ' +
        'review this request and contact the data subject with a timeline for eligible data anonymisation.'
      : 'Deletion request logged. This client has no transactional records. A Compliance Officer will ' +
        'review this request. Eligible non-transactional PII may be anonymised within 30 days.',
    nextSteps: [
      'A COMPLIANCE_OFFICER will review this request within 30 days.',
      hasTransactions
        ? 'Transaction-linked records (KYC, documents, audit events) must be retained for 10 years from the date of the last transaction.'
        : 'Non-transactional PII may be anonymised after review.',
      'You will be notified of the outcome via the registered contact details.',
    ],
  };
}
