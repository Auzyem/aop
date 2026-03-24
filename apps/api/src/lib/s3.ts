import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '@aop/utils';

function buildS3Client(): S3Client {
  const region = process.env.AWS_REGION ?? 'us-east-1';

  if (process.env.MINIO_ENDPOINT) {
    return new S3Client({
      region,
      endpoint: process.env.MINIO_ENDPOINT,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      },
      forcePathStyle: true, // required for MinIO
    });
  }

  return new S3Client({
    region,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        }
      : undefined, // falls back to IAM role / env chain
  });
}

const globalForS3 = globalThis as unknown as { s3Client: S3Client | undefined };
export const s3Client: S3Client = globalForS3.s3Client ?? buildS3Client();
if (process.env.NODE_ENV !== 'production') globalForS3.s3Client = s3Client;

const BUCKET = process.env.AWS_S3_BUCKET ?? 'aop-documents';

export async function uploadToS3(
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ storageKey: string; url: string }> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  const endpoint = process.env.MINIO_ENDPOINT;
  const url = endpoint
    ? `${endpoint}/${BUCKET}/${key}`
    : `https://${BUCKET}.s3.${process.env.AWS_REGION ?? 'us-east-1'}.amazonaws.com/${key}`;

  logger.debug({ key, bucket: BUCKET }, 'Uploaded file to S3');
  return { storageKey: key, url };
}

export async function getObjectSizeBytes(storageKey: string): Promise<number> {
  const head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey }));
  return head.ContentLength ?? 0;
}

export async function getObjectBytes(storageKey: string): Promise<Buffer> {
  const resp = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }));
  if (!resp.Body) return Buffer.alloc(0);
  // Body is a ReadableStream in Node.js — collect chunks
  const chunks: Uint8Array[] = [];
  for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function getSignedDownloadUrl(storageKey: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }), {
    expiresIn,
  });
}
