import { expect } from 'expect';
import { bookingLoader } from '../loader';
test(
  'one fetch and ordered misses',
  async () => {
    const calls: any[] = [];
    const loader = bookingLoader('n', async (t, ids) => {
      calls.push([t, ids]);
      return [
        { id: '2', tenant: t, title: 'B' },
        { id: '1', tenant: t, title: 'A' },
      ];
    });
    expect((await loader.loadMany(['1', 'x', '2', '1'])).map((x: any) => x?.title ?? null)).toEqual([
      'A',
      null,
      'B',
      'A',
    ]);
    expect(calls).toEqual([['n', ['1', 'x', '2']]]);
  },
  { hint: 'Map batch keys to a lookup map after fetching once.' },
);
test('new requests have independent caches', async () => {
  let count = 0;
  const fetcher = async (t: string) => [{ id: '1', tenant: t, title: String(++count) }];
  const a = bookingLoader('n', fetcher);
  await a.load('1');
  await a.load('1');
  const b = bookingLoader('n', fetcher);
  expect((await b.load('1'))?.title).toBe('2');
});
test('two tenants never share a value', async () => {
  const fetcher = async (t: string) => [{ id: '1', tenant: t, title: t }];
  expect((await bookingLoader('n', fetcher).load('1'))?.tenant).toBe('n');
  expect((await bookingLoader('s', fetcher).load('1'))?.tenant).toBe('s');
});
test('unexpected foreign rows are excluded', async () =>
  expect(await bookingLoader('n', async () => [{ id: '1', tenant: 's', title: 'secret' }]).load('1')).toBeNull());
test('repository outage is not a missing record', async () =>
  expect(
    bookingLoader('n', async () => {
      throw Error('offline');
    }).load('1'),
  ).rejects.toThrow('offline'));
