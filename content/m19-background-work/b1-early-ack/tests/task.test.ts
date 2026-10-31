import { expect } from 'expect';
import { dispatch } from '../dispatch';
test('failed delivery leaves event pending', async () => {
  let ack = false;
  await expect(
    dispatch(
      'e',
      async () => {
        throw Error('offline');
      },
      async () => {
        ack = true;
      },
    ),
  ).rejects.toThrow('offline');
  expect(ack).toBe(false);
});
test('acknowledgement follows completed async delivery', async () => {
  const steps: string[] = [];
  expect(
    await dispatch(
      'e',
      async () => {
        await Promise.resolve();
        steps.push('delivered');
        return 42;
      },
      async () => {
        steps.push('ack');
      },
    ),
  ).toBe(42);
  expect(steps).toEqual(['delivered', 'ack']);
});
test('ack failure is visible for safe recovery', async () =>
  await expect(
    dispatch(
      'e',
      async () => 42,
      async () => {
        throw Error('ack failed');
      },
    ),
  ).rejects.toThrow('ack failed'));
