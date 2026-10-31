import type { IncomingHttpHeaders } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../packages/contracts/context';
import { resolveHttpContext } from '../services/http-context';
export type { RuntimeContext } from '../services/http-context';
// Synthetic fixture; production token verification is a separate responsibility.
const principals: Record<string, Principal> = {
  'north-agent': { id: 'ada', memberships: { north: 'agent' } },
  'south-agent': { id: 'ben', memberships: { south: 'agent' } },
  'north-reader': { id: 'reader', memberships: { north: 'reader' } },
  'south-reader': { id: 'reader', memberships: { south: 'reader' } },
};
export const requestContext = (headers: IncomingHttpHeaders) =>
  resolveHttpContext(headers, principals, randomUUID);
