// Minimal signed tokens: "<base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>".
// Same idea as a JWT, without the library. The payload is READABLE by anyone — never put secrets in it.
import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => process.env.TOKEN_SECRET ?? 'taskforge-dev-secret';
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest();

/** A token for this user, valid for `ttlSeconds` (default: 7 days). */
export function signToken(userId: string, ttlSeconds = 60 * 60 * 24 * 7): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString('base64url');
  return `${payload}.${sign(payload).toString('base64url')}`;
}

/** The user id inside a valid, unexpired token — or null for anything else. Never throws. */
export function verifyToken(token: string): { userId: string } | null {
  const [payload, signature] = String(token).split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const given = Buffer.from(signature, 'base64url');
  // constant-time comparison so attackers can't learn the signature byte by byte
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof sub !== 'string' || typeof exp !== 'number' || exp * 1000 < Date.now()) return null;
    return { userId: sub };
  } catch {
    return null;
  }
}
