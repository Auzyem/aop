import { execFile } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@aop/db';
import { ValidationError } from '@aop/utils';
import { logger } from '@aop/utils';
import { uploadToS3 } from '../../lib/s3.js';
import type { KycDocumentType } from '@aop/db';

const execFileAsync = promisify(execFile);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);

// ---------------------------------------------------------------------------
// ClamAV scan (best-effort — proceeds if ClamAV not installed)
// ---------------------------------------------------------------------------

async function clamScan(buffer: Buffer): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { stdout } = await execFileAsync('clamscan', ['--no-summary', '-'], {
      input: buffer,
    } as any);
    if (stdout.includes('FOUND')) {
      throw new ValidationError('Malware detected in uploaded file');
    }
  } catch (err: unknown) {
    if (err instanceof ValidationError) throw err;
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      logger.warn('ClamAV not available — skipping malware scan');
    } else {
      logger.warn({ err }, 'ClamAV scan failed — proceeding without scan');
    }
  }
}

// ---------------------------------------------------------------------------
// Upload KYC document
// ---------------------------------------------------------------------------

export async function uploadKycDocument(
  clientId: string,
  uploaderId: string,
  documentType: KycDocumentType,
  file: Express.Multer.File,
) {
  // Validate file
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError('File exceeds the maximum allowed size of 50 MB');
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new ValidationError(`File type not allowed. Allowed types: PDF, JPEG, PNG, TIFF`);
  }

  // ClamAV scan
  await clamScan(file.buffer);

  // Build S3 key
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const s3Key = `kyc/${clientId}/${documentType}/${timestamp}-${safeFilename}`;

  // Upload to S3
  const { storageKey, url } = await uploadToS3(s3Key, file.buffer, file.mimetype);

  // GDPR retention: 10 years from today
  const retainUntil = new Date();
  retainUntil.setFullYear(retainUntil.getFullYear() + 10);

  // Persist Document record (GDPR retention tracking)
  await prisma.document.create({
    data: {
      clientId,
      documentType: 'KYC_IDENTITY_DOCUMENT',
      filename: file.originalname,
      storageKey,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: uploaderId,
      retainUntil,
    },
  });

  // Persist KycRecord (KYC workflow tracking)
  const kycRecord = await prisma.kycRecord.create({
    data: {
      clientId,
      documentType,
      fileUrl: url,
      uploadedBy: uploaderId,
      status: 'PENDING',
    },
  });

  return kycRecord;
}
