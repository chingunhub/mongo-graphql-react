// A small stand-in for jsonwebtoken: a signed payload with an optional expiry.
// The real gateway calls jwt.verify, which fails in the same two ways.
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = 'one-secret-for-both-kinds-of-token';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const signature = (body: string) => createHmac('sha256', SECRET).update(body).digest('base64url');

/** Signs a payload. `expiresInMs` is counted from `now`. */
export function sign(payload: Record<string, unknown>, expiresInMs?: number, now = Date.now()): string {
  const body = encode(expiresInMs === undefined ? payload : { ...payload, exp: now + expiresInMs });
  return `${body}.${signature(body)}`;
}

/** Returns the payload, or throws `Invalid token` or `Token expired`. */
export function verify<T = Record<string, unknown>>(token: string, now = Date.now()): T {
  const [body, given] = String(token).split('.');
  if (!body || !given) throw new Error('Invalid token');
  const expected = Buffer.from(signature(body));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid token');
  let payload: { exp?: number };
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid token');
  }
  if (typeof payload.exp === 'number' && payload.exp <= now) throw new Error('Token expired');
  return payload as T;
}
