import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.context<{ accountId: string | null }>().create();
export function shippingRouter() {
  return t.router({
    quote: t.procedure
      .input(
        z
          .object({
            kilograms: z.number().positive().max(30),
            destination: z.enum(['domestic', 'international']),
          })
          .strict(),
      )
      .query(({ input, ctx }) => {
        if (!ctx.accountId) throw new TRPCError({ code: 'UNAUTHORIZED' });
        return {
          cost:
            input.destination === 'domestic' ? 5 + Math.ceil(input.kilograms) * 2 : 12 + Math.ceil(input.kilograms) * 5,
        };
      }),
  });
}
