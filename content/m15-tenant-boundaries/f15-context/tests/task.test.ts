import { expect } from 'expect';
import { buildContext, requireAction } from '../packages/contracts/context';
const principal = {
  id: 'mia',
  memberships: { north: 'admin', south: 'reader' },
} as const;
test('context contains only selected request identity', () => {
  const before = JSON.stringify(principal);
  expect(buildContext(principal, 'south', 'r1')).toEqual({
    tenant: 'south',
    actorId: 'mia',
    role: 'reader',
    requestId: 'r1',
  });
  expect(JSON.stringify(principal)).toBe(before);
});
test('anonymous and foreign tenant fail closed', () => {
  expect(() => buildContext(null, 'north', 'r')).toThrow('UNAUTHENTICATED');
  expect(() => buildContext(principal, 'other', 'r')).toThrow('FORBIDDEN');
  expect(() => buildContext(principal, 'toString', 'r')).toThrow('FORBIDDEN');
  expect(() => buildContext(principal, 'constructor', 'r')).toThrow('FORBIDDEN');
});
test('empty correlation ID fails explicitly', () =>
  expect(() => buildContext(principal, 'north', '  ')).toThrow('BAD_REQUEST'));
test('every role-action combination', () => {
  for (const role of ['reader', 'agent', 'admin'] as const) {
    const c = buildContext({ id: 'a', memberships: { north: role } }, 'north', 'r');
    for (const action of ['tickets:read', 'tickets:triage', 'plugins:manage'] as const) {
      const allowed =
        action === 'tickets:read' || role === 'admin' || (role === 'agent' && action === 'tickets:triage');
      if (allowed) expect(() => requireAction(c, action)).not.toThrow();
      else expect(() => requireAction(c, action)).toThrow('FORBIDDEN');
    }
  }
});
test('admin in another tenant gives no extra power', () =>
  expect(() => requireAction(buildContext(principal, 'south', 'r'), 'tickets:triage')).toThrow('FORBIDDEN'));
test('unknown runtime values fail closed', () => {
  expect(() => requireAction({ ...buildContext(principal, 'north', 'r'), role: 'constructor' as any }, 'tickets:read')).toThrow('FORBIDDEN');
  expect(() => buildContext({ id: 'a', memberships: { n: 'root' } as any }, 'n', 'r')).toThrow('FORBIDDEN');
  expect(() => requireAction(buildContext(principal, 'north', 'r'), 'tickets:delete' as any)).toThrow('FORBIDDEN');
});
