export type ClientPortal = { _id: string; name: string };
export type CPUser = { _id: string; clientPortalId: string; email: string; erxesCustomerId?: string };
export type StaffUser = { _id: string };

/** What the plugin decoded from the gateway's headers. */
export type Context = { user?: StaffUser; clientPortal?: ClientPortal; cpUser?: CPUser };

export type Resolver = (root: any, args: any, context: Context, info: any) => any;
export type WrapperConfig = { forClientPortal?: boolean; cpUserRequired?: boolean };

/** Returns a resolver that asks the portal questions first, then calls the original. */
export function wrapPublicResolver(resolver: Resolver, config?: WrapperConfig): Resolver {
  throw new Error('TODO: check the portal, then the portal user');
}

/** Wraps every resolver of the object, in place. */
export function markResolvers(resolvers: Record<string, Resolver>, config: WrapperConfig): void {
  throw new Error('TODO');
}
