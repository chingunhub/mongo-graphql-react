import { expect } from 'expect';
import { retryPlan } from '../retry';
const base = {
  maxAttempts: 5,
  baseDelay: 250,
  maxDelay: 700,
  kind: 'transient' as const,
};
test('exponential delay is capped', () =>
  expect([1, 2, 3, 4].map((attemptsMade) => retryPlan({ ...base, attemptsMade }))).toEqual([
    { delayMs: 250 },
    { delayMs: 500 },
    { delayMs: 700 },
    { delayMs: 700 },
  ]));
test('budget counts the initial attempt', () => {
  expect(retryPlan({ ...base, attemptsMade: 5 })).toBeNull();
  expect(retryPlan({ ...base, maxAttempts: 1, attemptsMade: 1 })).toBeNull();
});
test('permanent failure never retries', () =>
  expect(retryPlan({ ...base, attemptsMade: 1, kind: 'permanent' })).toBeNull());
test('invalid configuration fails even when budget is exhausted', () => {
  for (const patch of [
    { attemptsMade: 0 },
    { attemptsMade: 1.2 },
    { maxAttempts: 0 },
    { baseDelay: NaN },
    { maxDelay: Infinity },
    { maxDelay: 1 },
    { kind: 'unknown' },
  ])
    expect(() => retryPlan({ ...base, attemptsMade: 8, ...patch } as any)).toThrow('Invalid retry policy');
});
