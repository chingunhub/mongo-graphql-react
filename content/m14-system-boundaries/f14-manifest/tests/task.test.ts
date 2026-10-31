import { expect } from 'expect';
import { orderPlugins } from '../packages/contracts/plugins';
const p = (name: string, requires: string[] = [], version = 1) => ({
  name,
  requires,
  version,
});
test('dependencies initialize before consumers', () =>
  expect(orderPlugins([p('tickets', ['contacts']), p('contacts')])).toEqual(['contacts', 'tickets']));
test('deterministic diamond initializes shared dependency once', () => {
  const input = [
    p('web', ['tickets', 'activity']),
    p('tickets', ['contracts']),
    p('activity', ['contracts']),
    p('contracts'),
  ];
  const original = JSON.stringify(input);
  expect(orderPlugins(input)).toEqual(['contracts', 'activity', 'tickets', 'web']);
  expect(JSON.stringify(input)).toBe(original);
});
test('roots are visited alphabetically, whatever the input order', () =>
  expect(orderPlugins([p('beta'), p('alpha')])).toEqual(['alpha', 'beta']));
test('each requires list is visited alphabetically', () =>
  expect(orderPlugins([p('app', ['zeta', 'mid']), p('mid'), p('zeta')])).toEqual(['mid', 'zeta', 'app']));
test('duplicate registration is rejected', () =>
  expect(() => orderPlugins([p('a'), p('a')])).toThrow('Duplicate plugin'));
test('unsupported protocol version is rejected', () =>
  expect(() => orderPlugins([p('a', [], 2)])).toThrow('Unsupported version'));
test('unknown dependency is rejected', () => expect(() => orderPlugins([p('a', ['b'])])).toThrow('Missing dependency'));
test('cycles fail with a useful diagnosis', () =>
  expect(() => orderPlugins([p('a', ['b']), p('b', ['a'])])).toThrow('Dependency cycle'));
test('empty registry is valid', () => expect(orderPlugins([])).toEqual([]));
