import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { Ticket } from './tickets/model';
import { requireAction, type Context } from '../packages/contracts/context';
const t = initTRPC.context<Context>().create();
export function createTriageRouter() {
  return t.router({
    triage: t.procedure.input(z.any()).mutation(() => {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED' });
    }),
  });
}
export type TriageRouter = ReturnType<typeof createTriageRouter>;
