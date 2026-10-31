import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { Ticket } from './tickets/model';
import { requireAction, type Context } from '../packages/contracts/context';
const t = initTRPC.context<Context>().create();
export function createTriageRouter() {
  return t.router({
    triage: t.procedure
      .input(
        z
          .object({
            ticketId: z.string().regex(/^[a-f0-9]{24}$/i),
            priority: z.enum(['low', 'normal', 'high']),
            expectedVersion: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          requireAction(ctx, 'tickets:triage');
        } catch {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const row = await Ticket.findOneAndUpdate(
          {
            _id: input.ticketId,
            tenant: ctx.tenant,
            version: input.expectedVersion,
          },
          { $set: { priority: input.priority }, $inc: { version: 1 } },
          { returnDocument: 'after', runValidators: true },
        ).lean();
        if (!row)
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Ticket changed or is unavailable',
          });
        return {
          id: String(row._id),
          priority: row.priority,
          version: row.version,
        };
      }),
  });
}
export type TriageRouter = ReturnType<typeof createTriageRouter>;
