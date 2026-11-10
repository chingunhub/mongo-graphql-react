export type ClientPortal = { _id: string; name: string };
export type CPUser = { _id: string; clientPortalId: string; email: string; erxesCustomerId?: string };
export type StaffUser = { _id: string };

/** What the plugin decoded from the gateway's headers. */
export type Context = { user?: StaffUser; clientPortal?: ClientPortal; cpUser?: CPUser };

export type Resolver = (root: any, args: any, context: Context, info: any) => any;
export type WrapperConfig = { forClientPortal?: boolean; cpUserRequired?: boolean };

/** Returns a resolver that asks the portal questions first, then calls the original. */
export function wrapPublicResolver(resolver: Resolver, config?: WrapperConfig): Resolver {
  return async (root, args, context, info) => {
    if (config?.forClientPortal) {
      if (!context?.clientPortal?._id) throw new Error('Client portal required');
      if (config.cpUserRequired && !context.cpUser?._id) throw new Error('Client portal user required');
    }
    return resolver(root, args, context, info);
  };
}

/** Wraps every resolver of the object, in place. */
export function markResolvers(resolvers: Record<string, Resolver>, config: WrapperConfig): void {
  for (const name of Object.keys(resolvers)) {
    resolvers[name] = wrapPublicResolver(resolvers[name], config);
  }
}
