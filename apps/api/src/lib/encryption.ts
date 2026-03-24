/**
 * AES-256-GCM field-level encryption for PII data.
 *
 * Key source: FIELD_ENCRYPTION_KEY env var (32 bytes, base64-encoded).
 * Each encrypted value is self-contained: iv:authTag:ciphertext (all hex).
 *
 * Usage:
 *   const encrypted = encryptField('123-45-6789');
 *   const plain     = decryptField(encrypted);
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '@aop/utils';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const TAG_BYTES = 16; // 128-bit auth tag

function getKey(): Buffer {
  const keyB64 = process.env.FIELD_ENCRYPTION_KEY;
  if (!keyB64) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FIELD_ENCRYPTION_KEY must be set in production');
    }
    // Dev/test fallback — 32 zero bytes; never use in production
    return Buffer.alloc(32, 0);
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error(`FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}`);
  }
  return key;
}

/**
 * Encrypt a string value using AES-256-GCM.
 * Returns a colon-separated hex string: "{iv}:{authTag}:{ciphertext}"
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted field value.
 * Accepts the format produced by encryptField().
 * Returns null on decryption failure (tampered or wrong key) — never throws.
 */
export function decryptField(ciphertext: string): string | null {
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) throw new Error('Invalid ciphertext format');

    const [ivHex, tagHex, dataHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');

    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Invalid IV or auth tag length');
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    logger.error({ err }, 'Field decryption failed — data may be tampered or key mismatch');
    return null;
  }
}

/**
 * Returns true if the value looks like an encrypted field (iv:tag:ciphertext format).
 * Used to avoid double-encrypting already-encrypted values.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
