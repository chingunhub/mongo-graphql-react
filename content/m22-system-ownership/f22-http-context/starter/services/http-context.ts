import { TRPCError } from '@trpc/server';
import type { IncomingHttpHeaders } from 'node:http';
import { buildContext, type Context, type Principal } from '../packages/contracts/context';
export type RuntimeContext = Context & { credential: string };
export function resolveHttpContext(
  headers: IncomingHttpHeaders,
  principals: Readonly<Record<string, Principal>>,
  newRequestId: () => string,
): RuntimeContext {
  // TODO: authenticate transport input, validate correlation, then delegate membership.
  throw new TRPCError({ code: 'UNAUTHORIZED' });
}
