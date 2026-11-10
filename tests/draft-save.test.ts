import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft } from '../web/src/draft';
import { createSaveOrder } from '../server/save-order';
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
}
test('a delayed acknowledgement cannot mark newer edits saved; flush waits for the newest revision', async () => {
  const first = deferred(),
    second = deferred(),
    snapshots: any[] = [];
  const draft = createDraft({
    initial: { 'a.ts': '' },
    key: 'a',
    save: async (files, version) => {
      snapshots.push({ files, version });
      await (snapshots.length === 1 ? first.promise : second.promise);
    },
  });
  draft.edit({ 'a.ts': 'A' });
  const flushing = draft.flush();
  await tick();
  draft.edit({ 'a.ts': 'B' });
  first.resolve();
  await tick();
  assert.equal(draft.state().saved, false);
  assert.equal(snapshots[1].files['a.ts'], 'B');
  second.resolve();
  await flushing;
  assert.equal(draft.state().saved, true);
  assert.ok(snapshots[1].version.revision > snapshots[0].version.revision);
  draft.dispose();
});
test('save failure retains a reloadable draft, shows an error, and retries successfully', async () => {
  const storage = memory();
  let fail = true;
  const options = {
    initial: { 'a.ts': 'server copy' },
    key: 'failure',
    storage,
    save: async () => {
      if (fail) throw new Error('offline');
    },
  };
  const draft = createDraft(options);
  draft.edit({ 'a.ts': 'last keystroke' });
  await assert.rejects(draft.flush(), /offline/);
  assert.match(draft.state().error!, /Not saved/);
  draft.dispose();
  const reopened = createDraft(options);
  assert.equal(reopened.state().files['a.ts'], 'last keystroke');
  fail = false;
  await reopened.flush();
  assert.equal(reopened.state().saved, true);
  assert.equal(storage.getItem('failure'), null);
  reopened.dispose();
});
test('unload sends the newest version; late requests cannot overwrite its contents', async () => {
  const gate = createSaveOrder(),
    wait = deferred();
  let disk = '';
  const draft = createDraft({
    initial: { a: '' },
    key: 'beacon',
    save: async (files, version) => {
      await wait.promise;
      gate('task', version, () => {
        disk = files.a;
      });
    },
  });
  draft.edit({ a: 'old' });
  const saving = draft.flush();
  await tick();
  draft.edit({ a: 'new' });
  draft.beacon((files, version) =>
    gate('task', version, () => {
      disk = files.a;
    }),
  );
  wait.resolve();
  await saving;
  assert.equal(disk, 'new');
  draft.dispose();
});
test('navigation waits for saves and a failed save leaves the current page available to retry', async () => {
  const { default: dom } = await import('global-jsdom');
  const cleanup = dom(undefined, { url: 'http://localhost/learn/one' });
  const { beforeNavigate, navigate } = await import('../web/src/router');
  const wait = deferred();
  let fail = false;
  const remove = beforeNavigate(async () => {
    await wait.promise;
    if (fail) throw new Error('offline');
  });
  const moving = navigate('/learn/two');
  assert.equal(location.pathname, '/learn/one');
  wait.resolve();
  await moving;
  assert.equal(location.pathname, '/learn/two');
  fail = true;
  await navigate('/learn/three');
  assert.equal(location.pathname, '/learn/two');
  fail = false;
  await navigate('/learn/three');
  assert.equal(location.pathname, '/learn/three');
  remove();
  cleanup();
});
