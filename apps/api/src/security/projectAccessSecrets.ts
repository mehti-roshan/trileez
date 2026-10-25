import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const algorithm = 'aes-256-gcm';
const key = createHash('sha256').update(env.projectAccessEncryptionKey, 'utf8').digest();

export interface EncryptedSecret {
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
  secretVersion: number;
  hasSecret: true;
  secretUpdatedAt: string;
}

export function encryptProjectAccessSecret(secret: string, organizationId: string): EncryptedSecret {
  const normalized = secret.trim();
  if (!normalized) throw new Error('Credential secret cannot be empty');
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  cipher.setAAD(Buffer.from(organizationId, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return {
    secretCiphertext: ciphertext.toString('base64'), secretIv: iv.toString('base64'), secretTag: cipher.getAuthTag().toString('base64'),
    secretVersion: 1, hasSecret: true, secretUpdatedAt: new Date().toISOString(),
  };
}

export function decryptProjectAccessSecret(record: Record<string, unknown>, organizationId: string): string | undefined {
  if (!record.secretCiphertext || !record.secretIv || !record.secretTag) return undefined;
  const decipher = createDecipheriv(algorithm, key, Buffer.from(String(record.secretIv), 'base64'));
  decipher.setAAD(Buffer.from(organizationId, 'utf8'));
  decipher.setAuthTag(Buffer.from(String(record.secretTag), 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(String(record.secretCiphertext), 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

const embeddedSecretPattern = /(password|passwd|secret|token|api[ _-]?key|رمز(?: عبور)?)\s*[:=]\s*([^،,;\n]+)/gi;

export function extractEmbeddedSecret(content: string): { content: string; secret?: string } {
  const extracted: Array<{ label: string; value: string }> = [];
  const sanitized = content.replace(embeddedSecretPattern, (_match, rawLabel: string, rawValue: string) => {
    const label = rawLabel.trim();
    const value = rawValue.trim();
    if (value && !['[محفوظ]', '[protected]', '[redacted]'].includes(value.toLowerCase())) extracted.push({ label, value });
    return `${label}: [محفوظ]`;
  }).trim();
  if (extracted.length === 0) return { content: sanitized };
  if (extracted.length === 1) return { content: sanitized, secret: extracted[0]!.value };
  return { content: sanitized, secret: extracted.map(({ label, value }) => `${label}: ${value}`).join('\n') };
}
