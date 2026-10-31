// Password hashing with Node's built-in scrypt (a memory-hard KDF — slow on purpose).
// Stored format: "scrypt$<salt hex>$<hash hex>"
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(plain, salt, KEYLEN);
  // constant-time comparison: don't leak how many bytes matched
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isHashed(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('scrypt$');
}
