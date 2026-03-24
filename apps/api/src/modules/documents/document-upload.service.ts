import { execFile } from 'child_process';
import { promisify } from 'util';
import { Queue } from 'bullmq';
import { prisma } from '@aop/db';
import type { DocumentType } from '@aop/db';
import { ValidationError } from '@aop/utils';
import { logger } from '@aop/utils';
import { uploadToS3 } from '../../lib/s3.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const fileType = require('file-type') as typeof import('file-type');

const execFileAsync = promisify(execFile);

const ALLOWED_MIMETYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);

// Magic byte signatures for supported file types
// The file-type package reads the first bytes to detect actual format
const ALLOWED_MAGIC_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

let ocrQueue: Queue | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initDocumentQueues(connection: any): void {
  ocrQueue = new Queue('ocr-processing', { connection });
}

async function scanWithClamAV(buffer: Buffer): Promise<void> {
  try {
    const tmp = `/tmp/aop-upload-${Date.now()}.bin`;
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmp, buffer);
    try {
      await execFileAsync('clamscan', ['--no-summary', tmp]);
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === 'ENOENT') {
      logger.warn('ClamAV not found — skipping virus scan');
      return;
    }
    // clamscan exits with code 1 when FOUND
    const output = (e.stderr ?? '') + String(err);
    if (output.includes('FOUND') || String(err).includes('FOUND')) {
      throw new ValidationError('Malware detected in uploaded file');
    }
    // Any other error (e.g. database not found) — log and proceed
    logger.warn({ err }, 'ClamAV scan inconclusive, proceeding');
  }
}

export async function uploadDocument(
  uploaderId: string,
  documentType: DocumentType,
  file: Express.Multer.File,
  opts: { transactionId?: string; clientId?: string },
): Promise<{ id: string; storageKey: string; filename: string }> {
  // Validate
  if (file.size > MAX_SIZE) {
    throw new ValidationError('File too large — maximum is 50 MB');
  }
  // Check Content-Type header claim (first gate)
  if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
    throw new ValidationError('Unsupported file type — allowed: PDF, JPEG, PNG, TIFF');
  }

  // Magic byte validation — verify actual file content matches claimed type
  // Prevents .php renamed to .pdf and similar attacks
  const detectedType = await fileType.fromBuffer(file.buffer);
  if (!detectedType || !ALLOWED_MAGIC_MIMES.has(detectedType.mime)) {
    throw new ValidationError(
      `File content does not match its declared type. Detected: ${detectedType?.mime ?? 'unknown'}. Allowed: PDF, JPEG, PNG, TIFF`,
    );
  }
  // Use the magic-byte detected MIME type, not the user-supplied one
  const verifiedMimeType = detectedType.mime;

  // ClamAV scan
  await scanWithClamAV(file.buffer);

  // S3 key
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const scope = opts.transactionId ?? opts.clientId ?? 'global';
  const key = `documents/${scope}/${documentType}/${timestamp}-${safeName}`;

  const { storageKey, url } = await uploadToS3(key, file.buffer, verifiedMimeType);

  // Determine version number for this document type on this transaction/client
  const existingCount = await prisma.document.count({
    where: {
      documentType,
      ...(opts.transactionId ? { transactionId: opts.transactionId } : {}),
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
  });
  const version = existingCount + 1;

  // Supersede previous versions
  if (existingCount > 0) {
    await prisma.document.updateMany({
      where: {
        documentType,
        approvalStatus: { not: 'SUPERSEDED' },
        ...(opts.transactionId ? { transactionId: opts.transactionId } : {}),
        ...(opts.clientId ? { clientId: opts.clientId } : {}),
      },
      data: { approvalStatus: 'SUPERSEDED' },
    });
  }

  const retainUntil = new Date();
  retainUntil.setFullYear(retainUntil.getFullYear() + 10);

  const doc = await prisma.document.create({
    data: {
      documentType,
      filename: file.originalname,
      storageKey,
      mimeType: verifiedMimeType,
      sizeBytes: file.size,
      uploadedBy: uploaderId,
      version,
      retainUntil,
      ...(opts.transactionId ? { transactionId: opts.transactionId } : {}),
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
  });

  // Enqueue OCR job (fire-and-forget)
  if (ocrQueue && file.mimetype !== 'application/pdf') {
    ocrQueue.add('ocr', { documentId: doc.id, storageKey: url }).catch((err) => {
      logger.warn({ err, documentId: doc.id }, 'Failed to enqueue OCR job');
    });
  }

  return { id: doc.id, storageKey, filename: doc.filename };
}
