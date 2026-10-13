import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env';

/**
 * Symmetric encryption for secrets stored in Postgres (SMTP passwords, Slack
 * webhook URLs). AES-256-GCM gives confidentiality + tamper detection.
 *
 * Format: `v1:<iv b64>:<auth tag b64>:<ciphertext b64>`
 *
 * Trade-off (documented in README): a single key from the environment rather
 * than a KMS with envelope encryption and rotation.
 */
const ALGO = 'aes-256-gcm';
const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decrypt(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unrecognised ciphertext format');
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
