/**
 * Simple symmetric encryption for API keys at rest.
 * In production, replace with a KMS (GCP KMS, AWS KMS, etc.).
 */
import crypto from 'crypto';

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET || 'dev-secret-do-not-use-in-prod';
  return crypto.createHash('sha256').update(secret).digest();
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encrypted: string): string {
  const key = getKey();
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
