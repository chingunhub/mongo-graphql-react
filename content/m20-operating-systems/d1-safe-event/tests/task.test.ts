import { expect } from 'expect';
import { operationalEvent } from '../event';
const base = {
  requestId: 'r1',
  tenant: 'n',
  operation: 'dispatch',
  outcome: 'ok',
  durationMs: 0,
};
test('output is an explicit allowlist', () =>
  expect(
    operationalEvent({
      ...base,
      token: 'secret',
      headers: { authorization: 'secret' },
      payload: { email: 'private' },
      futureField: 'also private',
    }),
  ).toEqual(base));
test('does not mutate the input', () => {
  const input = { ...base, payload: { x: 1 } };
  const before = JSON.stringify(input);
  operationalEvent(input);
  expect(JSON.stringify(input)).toBe(before);
});
test('invalid runtime values fail clearly', () => {
  for (const input of [
    null,
    [],
    { ...base, tenant: ' ' },
    { ...base, durationMs: NaN },
    { ...base, durationMs: Infinity },
    { ...base, durationMs: -1 },
    { ...base, outcome: 'maybe' },
    { ...base, operation: 2 },
  ])
    expect(() => operationalEvent(input)).toThrow('Invalid operational event');
});
