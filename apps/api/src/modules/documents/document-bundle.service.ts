import archiver from 'archiver';
import { Readable } from 'stream';
import type { Response } from 'express';
import { s3Client } from '../../lib/s3.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@aop/db';
import { NotFoundError } from '@aop/utils';
import type { AuthenticatedUser } from '@aop/types';

const BUCKET = process.env.AWS_S3_BUCKET ?? 'aop-documents';

export async function bundleTransactionDocuments(
  transactionId: string,
  actor: AuthenticatedUser,
  res: Response,
): Promise<void> {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, countryCode: true },
  });
  if (!tx) throw new NotFoundError('Transaction not found');

  const docs = await prisma.document.findMany({
    where: { transactionId, isDeleted: false },
    orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
  });

  if (docs.length === 0) throw new NotFoundError('No documents found for this transaction');

  const zipFilename = `${transactionId}-documents.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  archive.on('error', (err) => {
    throw err;
  });

  for (const doc of docs) {
    try {
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: doc.storageKey });
      const s3Response = await s3Client.send(cmd);
      if (s3Response.Body) {
        const stream = s3Response.Body as NodeJS.ReadableStream;
        archive.append(stream as Readable, {
          name: `${doc.documentType}_v${doc.version}_${doc.filename}`,
        });
      }
    } catch {
      // Skip unreachable files — don't abort the whole bundle
    }
  }

  await archive.finalize();
}
