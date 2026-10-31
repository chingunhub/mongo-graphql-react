export type Role = 'reader' | 'agent' | 'admin';
export type Principal = { id: string; memberships: Record<string, Role> };
export type Context = {
  tenant: string;
  actorId: string;
  role: Role;
  requestId: string;
};
export type Action = 'tickets:read' | 'tickets:triage' | 'plugins:manage';
export function buildContext(principal: Principal | null, tenant: string, requestId: string): Context {
  throw new Error('TODO: request identity');
}
export function requireAction(context: Context, action: Action): void {
  throw new Error('TODO: action policy');
}
