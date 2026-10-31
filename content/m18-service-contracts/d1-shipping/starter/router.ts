import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.context<{ accountId: string | null }>().create();
export function shippingRouter() {
  return t.router({
    quote: t.procedure.input(z.any()).query(() => ({ cost: 0 })),
  });
}
