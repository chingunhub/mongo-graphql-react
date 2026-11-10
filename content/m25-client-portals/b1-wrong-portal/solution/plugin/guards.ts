import type { Context } from './context';

export type Resolver = (root: undefined, args: any, context: Context) => any;
export type WrapperConfig = { forClientPortal?: boolean; cpUserRequired?: boolean };

export function wrapPublicResolver(resolver: Resolver, config?: WrapperConfig): Resolver {
  return async (root, args, context) => {
    if (config?.forClientPortal) {
      if (!context.clientPortal) throw new Error('Client portal required');
      if (config.cpUserRequired && !context.cpUser) throw new Error('Client portal user required');
    }
    return resolver(root, args, context);
  };
}

export function markResolvers(resolvers: Record<string, Resolver>, config: WrapperConfig): void {
  for (const name of Object.keys(resolvers)) resolvers[name] = wrapPublicResolver(resolvers[name], config);
}
