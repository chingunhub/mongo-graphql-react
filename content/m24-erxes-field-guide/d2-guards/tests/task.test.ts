import { expect } from 'expect';
import {
  can,
  checkLogin,
  checkPermission,
  moduleCheckPermission,
  moduleRequireLogin,
  permissionWrapper,
  requireLogin,
} from '../permissions';

const agent = { _id: 'a1', actions: ['tickets:read'] };
const owner = { _id: 'o1', isOwner: true };
const call = (fn: any, context: any) => fn({ root: 1 }, { arg: 2 }, context, { info: 3 });

test(
  'checkLogin and can',
  () => {
    expect(() => checkLogin()).toThrow('Login required');
    expect(() => checkLogin({} as any)).toThrow('Login required');
    expect(() => checkLogin({ _id: '' })).toThrow('Login required');
    expect(() => checkLogin(agent)).not.toThrow();
    expect(can('tickets:read', agent)).toBe(true);
    expect(can('tickets:write', agent)).toBe(false);
    expect(can('anything', owner)).toBe(true);
    expect(can('tickets:read')).toBe(false);
    expect(can('tickets:read', { _id: 'x' })).toBe(false);
    expect(can('tickets:read', { _id: 'x', isOwner: 'yes' as any })).toBe(false);
    expect(can('anything', { _id: '', isOwner: true })).toBe(false);
    expect(can('tickets:read', { actions: ['tickets:read'] } as any)).toBe(false);
  },
  { hint: 'Only isOwner exactly true grants everything. A user with no actions list can still be asked about.' },
);

test(
  'a wrapper runs its checkers in order and passes all four arguments through',
  async () => {
    const seen: any[] = [];
    const order: string[] = [];
    const cls: any = {
      method(...args: any[]) {
        seen.push(args);
        return 'value';
      },
    };
    permissionWrapper(cls, 'method', [
      () => {
        order.push('first');
      },
      () => {
        order.push('second');
      },
    ]);
    await expect(call(cls.method, { user: agent })).resolves.toBe('value');
    expect(order).toEqual(['first', 'second']);
    expect(seen).toEqual([[{ root: 1 }, { arg: 2 }, { user: agent }, { info: 3 }]]);
  },
  { hint: 'Keep a reference to the old method before you replace it, or it will call itself.' },
);

test(
  'a failed checker stops the resolver, as a rejected promise',
  async () => {
    let ran = false;
    const cls: any = { method: () => (ran = true) };
    requireLogin(cls, 'method');
    const result = call(cls.method, {});
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow('Login required');
    expect(ran).toBe(false);
  },
  { hint: 'Resolvers are async here, so a guard failure should reject and not throw synchronously.' },
);

test(
  'moduleRequireLogin guards every resolver in the object',
  async () => {
    const queries: any = { one: () => 1, two: () => 2 };
    moduleRequireLogin(queries);
    await expect(call(queries.one, {})).rejects.toThrow('Login required');
    await expect(call(queries.two, {})).rejects.toThrow('Login required');
    await expect(call(queries.one, { user: agent })).resolves.toBe(1);
    await expect(call(queries.two, { user: agent })).resolves.toBe(2);
  },
  { hint: 'A closure bug here makes every wrapper call the same resolver.' },
);

test(
  'checkPermission separates logged out from not allowed',
  async () => {
    const cls: any = { read: () => 'secret' };
    checkPermission(cls, 'read', 'tickets:write');
    await expect(call(cls.read, {})).rejects.toThrow('Login required');
    await expect(call(cls.read, { user: agent })).rejects.toThrow('Permission required');
    await expect(call(cls.read, { user: owner })).resolves.toBe('secret');
  },
  { hint: 'Login comes first, so a stranger never learns which action exists.' },
);

test(
  'defaultValue is honored even when it is falsy, but never for a stranger',
  async () => {
    for (const fallback of [0, false, '', [], null]) {
      const cls: any = { read: () => 'secret' };
      checkPermission(cls, 'read', 'tickets:write', fallback);
      await expect(call(cls.read, { user: agent })).resolves.toEqual(fallback);
      await expect(call(cls.read, {})).rejects.toThrow('Login required');
    }
  },
  { hint: '`if (defaultValue)` treats 0 and false as missing. How do you ask "was one provided"?' },
);

test(
  'moduleCheckPermission wraps every method, and guards stack',
  async () => {
    const queries: any = { one: () => 1, two: () => 2 };
    moduleCheckPermission(queries, 'tickets:read', []);
    await expect(call(queries.one, { user: agent })).resolves.toBe(1);
    await expect(call(queries.two, { user: { _id: 'x' } })).resolves.toEqual([]);
    const stacked: any = { one: () => 1 };
    requireLogin(stacked, 'one');
    checkPermission(stacked, 'one', 'tickets:read');
    await expect(call(stacked.one, {})).rejects.toThrow('Login required');
    await expect(call(stacked.one, { user: agent })).resolves.toBe(1);
  },
  { hint: 'Each wrapper only needs to know about the method it replaced.' },
);
