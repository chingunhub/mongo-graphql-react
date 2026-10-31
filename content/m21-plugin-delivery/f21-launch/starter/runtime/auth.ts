import { TRPCError } from '@trpc/server';
import type { IncomingHttpHeaders } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildContext, type Context, type Principal } from '../packages/contracts/context';

export type RuntimeContext = Context & { credential: string };
// Synthetic local credentials, deliberately separate from production authentication.
const principals: Record<string, Principal> = {
  'north-agent': { id: 'ada', memberships: { north: 'agent' } },
  'south-agent': { id: 'ben', memberships: { south: 'agent' } },
  'north-reader': { id: 'reader', memberships: { north: 'reader' } },
  'south-reader': { id: 'reader', memberships: { south: 'reader' } },
};
export function requestContext(headers: IncomingHttpHeaders): RuntimeContext {
  const credential = typeof headers.authorization === 'string' ? headers.authorization : '';
  const token = credential.startsWith('Bearer ') ? credential.slice(7) : '';
  const principal = Object.hasOwn(principals, token) ? principals[token] : null;
  const tenant = typeof headers['x-relay-tenant'] === 'string' ? headers['x-relay-tenant'] : '';
  const requestId = typeof headers['x-request-id'] === 'string' ? headers['x-request-id'] : randomUUID();
  try {
    return { ...buildContext(principal, tenant, requestId), credential };
  } catch (error) {
    const message = (error as Error).message;
    throw new TRPCError({
      code: message === 'UNAUTHENTICATED' ? 'UNAUTHORIZED' : message === 'BAD_REQUEST' ? 'BAD_REQUEST' : 'FORBIDDEN',
      message,
    });
  }
}
