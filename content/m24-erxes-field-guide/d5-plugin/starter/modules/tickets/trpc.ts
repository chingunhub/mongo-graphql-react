import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { IModels } from '../../connectionResolvers';

export type TRPCContext = { subdomain: string; models: IModels };

const t = initTRPC.context<TRPCContext>().create();

export const appRouter = t.router({
  // TODO: tickets.count
});
