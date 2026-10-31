import { expect } from 'expect';
import { createContext } from '../context';
test(
  'same local ID across tenants remains isolated',
  async () => {
    const fetchRows = async (t: string) => [{ id: '7', title: t }];
    expect((await createContext('n', fetchRows).loadRecord('7'))?.title).toBe('n');
    expect((await createContext('s', fetchRows).loadRecord('7'))?.title).toBe('s');
  },
  { hint: 'A cache hit never calls the scoped repository.' },
);
test('interleaved contexts capture their own tenant', async () => {
  const fetchRows = async (t: string) => [{ id: '8', title: t }];
  const a = createContext('n', fetchRows),
    b = createContext('s', fetchRows);
  expect((await Promise.all([a.loadRecord('8'), b.loadRecord('8')])).map((x) => x?.title)).toEqual(['n', 's']);
});
test('same request batches, later request refetches', async () => {
  let calls = 0;
  const fetchRows = async () => {
    calls++;
    return [];
  };
  const a = createContext('n', fetchRows);
  await Promise.all([a.loadRecord('1'), a.loadRecord('2')]);
  expect(calls).toBe(1);
  await a.loadRecord('1');
  expect(calls).toBe(1);
  await createContext('n', fetchRows).loadRecord('1');
  expect(calls).toBe(2);
});
