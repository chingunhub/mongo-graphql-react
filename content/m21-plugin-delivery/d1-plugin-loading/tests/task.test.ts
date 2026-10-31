import { expect } from 'expect';
import { loadPlugins } from '../plugins';
test('one import failure does not discard its siblings', async () =>
  expect(
    await loadPlugins(['a', 'b'], async (name) => {
      if (name === 'b') throw Error('private path');
      return { version: 1, title: 'Alpha' };
    }),
  ).toEqual([
    { name: 'a', status: 'ready', title: 'Alpha' },
    { name: 'b', status: 'failed', reason: 'load failed' },
  ]));
test('invalid runtime contract is distinct from transport failure', async () => {
  for (const mod of [null, { version: 2, title: 'x' }, { version: 1, title: '' }, { version: 1, title: 2 }])
    expect(await loadPlugins(['a'], async () => mod)).toEqual([
      { name: 'a', status: 'failed', reason: 'incompatible plugin' },
    ]);
});
test('imports start concurrently but output remains in requested order', async () => {
  const started: string[] = [];
  const release: Record<string, (v: unknown) => void> = {};
  const promise = loadPlugins(['a', 'b'], (name) => {
    started.push(name);
    return new Promise((resolve) => (release[name] = resolve));
  });
  await Promise.resolve();
  expect(started).toEqual(['a', 'b']);
  release.b({ version: 1, title: 'B' });
  release.a({ version: 1, title: 'A' });
  expect((await promise).map((x: any) => x.name)).toEqual(['a', 'b']);
});
test('empty input does no work', async () =>
  expect(
    await loadPlugins([], async () => {
      throw Error('unexpected');
    }),
  ).toEqual([]));
