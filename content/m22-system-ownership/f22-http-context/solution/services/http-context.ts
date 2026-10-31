import { TRPCError } from '@trpc/server';
import type { IncomingHttpHeaders } from 'node:http';
import { buildContext, type Context, type Principal } from '../packages/contracts/context';
export type RuntimeContext = Context & { credential: string };
export function resolveHttpContext(
  headers: IncomingHttpHeaders,
  principals: Readonly<Record<string, Principal>>,
  newRequestId: () => string,
): RuntimeContext {
  const credential = typeof headers.authorization === 'string' ? headers.authorization : '';
  const token = credential.startsWith('Bearer ') ? credential.slice(7) : '';
  if (!token || !Object.hasOwn(principals, token)) throw new TRPCError({ code: 'UNAUTHORIZED' });
  const tenant = headers['x-relay-tenant'];
  if (typeof tenant !== 'string' || !tenant.trim()) throw new TRPCError({ code: 'BAD_REQUEST' });
  const requestId = headers['x-request-id'] === undefined ? newRequestId() : headers['x-request-id'];
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId))
    throw new TRPCError({ code: 'BAD_REQUEST' });
  try {
    return {
      ...buildContext(principals[token], tenant, requestId),
      credential,
    };
  } catch (error) {
    const message = (error as Error).message;
    const codes = {
      UNAUTHENTICATED: 'UNAUTHORIZED',
      BAD_REQUEST: 'BAD_REQUEST',
      FORBIDDEN: 'FORBIDDEN',
    } as const;
    if (!Object.hasOwn(codes, message)) throw error;
    throw new TRPCError({
      code: codes[message as keyof typeof codes],
      message,
    });
  }
}
