export type Role = 'reader' | 'agent' | 'admin';
export type Principal = { id: string; memberships: Record<string, Role> };
export type Context = {
  tenant: string;
  actorId: string;
  role: Role;
  requestId: string;
};
export type Action = 'tickets:read' | 'tickets:triage' | 'plugins:manage';
const actions: Record<Role, readonly Action[]> = {
  reader: ['tickets:read'],
  agent: ['tickets:read', 'tickets:triage'],
  admin: ['tickets:read', 'tickets:triage', 'plugins:manage'],
};
export function buildContext(principal: Principal | null, tenant: string, requestId: string): Context {
  if (!principal) throw new Error('UNAUTHENTICATED');
  if (!Object.hasOwn(principal.memberships, tenant)) throw new Error('FORBIDDEN');
  const role = principal.memberships[tenant];
  if (!Object.hasOwn(actions, role)) throw new Error('FORBIDDEN');
  if (!requestId.trim()) throw new Error('BAD_REQUEST');
  return { tenant, actorId: principal.id, role, requestId };
}
export function requireAction(context: Context, action: Action): void {
  if (!Object.hasOwn(actions, context.role) || !actions[context.role].includes(action)) throw new Error('FORBIDDEN');
}
