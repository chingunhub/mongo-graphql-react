import { expect } from 'expect';
import { shippingRouter } from '../router';
const caller = () => shippingRouter().createCaller({ accountId: 'a' });
test('real procedure calculates both destinations with rounded weight', async () => {
  expect(await caller().quote({ kilograms: 1.1, destination: 'domestic' })).toEqual({ cost: 9 });
  expect(await caller().quote({ kilograms: 30, destination: 'international' })).toEqual({ cost: 162 });
});
test('malformed, non-finite and unknown fields fail parsing', async () => {
  for (const input of [
    { kilograms: 0, destination: 'domestic' },
    { kilograms: 31, destination: 'domestic' },
    { kilograms: '2', destination: 'domestic' },
    { kilograms: Infinity, destination: 'domestic' },
    { kilograms: 1, destination: 'moon' },
    { kilograms: 1, destination: 'domestic', accountId: 'override' },
  ])
    await expect(caller().quote(input as any)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
});
test('anonymous callers receive an explicit authentication failure', async () =>
  await expect(
    shippingRouter().createCaller({ accountId: null }).quote({ kilograms: 1, destination: 'domestic' }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' }));
test('fractional boundary stays valid without coercion', async () =>
  expect(await caller().quote({ kilograms: 0.1, destination: 'international' })).toEqual({ cost: 17 }));
