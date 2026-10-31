import { expect } from 'expect';
import { resolveHttpContext } from '../services/http-context';
const principals = {
  good: { id: 'ada', memberships: { north: 'agent' as const } },
};
const headers = { authorization: 'Bearer good', 'x-relay-tenant': 'north' };
test('adapter preserves resolved identity without mutating inputs', () => {
  const before = JSON.stringify({ principals, headers });
  expect(resolveHttpContext(headers, principals, () => 'req-1')).toEqual({
    actorId: 'ada',
    tenant: 'north',
    role: 'agent',
    requestId: 'req-1',
    credential: 'Bearer good',
  });
  expect(JSON.stringify({ principals, headers })).toBe(before);
});
test('supplied correlation is not replaced', () => {
  expect(
    resolveHttpContext({ ...headers, 'x-request-id': 'r:2.ok' }, principals, () => {
      throw Error('must not generate');
    }).requestId,
  ).toBe('r:2.ok');
});
test('credential claims including prototype properties fail closed', () => {
  for (const authorization of [
    undefined,
    '',
    'Basic good',
    'Bearer missing',
    'Bearer __proto__',
    ['Bearer good'],
  ] as any[]) {
    expect(() => resolveHttpContext({ ...headers, authorization } as any, principals, () => 'r')).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  }
});
test('ambiguous tenant and correlation values are not silently defaulted', () => {
  for (const tenant of [undefined, '', [], ['north']] as any[])
    expect(() => resolveHttpContext({ ...headers, 'x-relay-tenant': tenant }, principals, () => 'r')).toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST' }),
    );
  for (const id of ['', [], ['r'], 'a, b', 'x'.repeat(129)] as any[])
    expect(() => resolveHttpContext({ ...headers, 'x-request-id': id }, principals, () => 'r')).toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST' }),
    );
  expect(() => resolveHttpContext(headers, principals, () => '')).toThrow(
    expect.objectContaining({ code: 'BAD_REQUEST' }),
  );
});
test('valid credential cannot select a foreign membership', () => {
  expect(() => resolveHttpContext({ ...headers, 'x-relay-tenant': 'south' }, principals, () => 'r')).toThrow(
    expect.objectContaining({ code: 'FORBIDDEN' }),
  );
});
test('an unexpected failure is not disguised as a client error', () => {
  const broken = {
    good: {
      id: 'ada',
      get memberships(): any {
        throw Error('directory offline');
      },
    },
  };
  expect(() => resolveHttpContext(headers, broken, () => 'r')).toThrow('directory offline');
});
import './system.test';
