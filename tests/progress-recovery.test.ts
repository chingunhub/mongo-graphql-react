import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProgressStore, emptyProgress, parseProgress } from '../server/progress-store';
const dirs: string[] = [];
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'forge-progress-test-'));
  dirs.push(d);
  return d;
};
test.after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const populated = () => ({
  ...emptyProgress(),
  items: {
    drill: {
      status: 'passed' as const,
      attempts: 3,
      hintsShown: 1,
      solutionRevealed: false,
      files: { 'main.ts': 'my own code' },
      passedAt: '2026-01-01T00:00:00Z',
    },
  },
  lessons: { intro: { doneAt: '2026-01-01T00:00:00Z' } },
  workspaces: {
    taskforge: {
      files: { 'app.ts': 'learner project' },
      updatedAt: '2026-01-01',
    },
  },
});
test('new installations and historical v1 files round-trip without losing learner work', () => {
  const d = dir(),
    file = join(d, 'progress.json');
  const store = createProgressStore(d);
  assert.deepEqual(store.get(), emptyProgress());
  Object.assign(store.get(), populated());
  store.flush();
  assert.deepEqual(createProgressStore(d).get(), populated());
  const old = populated() as any;
  delete old.review;
  assert.deepEqual(parseProgress(JSON.stringify(old)), populated());
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).items.drill.files['main.ts'], 'my own code');
});
test('invalid JSON, invalid shapes and unsupported versions fail closed and preserve bytes', () => {
  for (const text of [
    '{"items":',
    '{"version":1,"items":null}',
    JSON.stringify({ ...populated(), version: 2 }),
    JSON.stringify({
      ...populated(),
      workspaces: { taskforge: { files: { 'a.ts': 42 } } },
    }),
  ]) {
    const d = dir(),
      file = join(d, 'progress.json');
    writeFileSync(file, text);
    const store = createProgressStore(d);
    assert.throws(() => store.get(), /NOT been reset/);
    store.flush();
    assert.equal(readFileSync(file, 'utf8'), text);
    assert.deepEqual(readdirSync(d), ['progress.json']);
  }
});
test('corrupt primary is preserved and the newest valid backup recovers every progress field', () => {
  const d = dir(),
    file = join(d, 'progress.json');
  writeFileSync(file, 'broken original bytes');
  writeFileSync(file + '.backup-1', '{broken too');
  writeFileSync(file + '.backup-2', JSON.stringify(populated()));
  const store = createProgressStore(d);
  assert.deepEqual(store.get(), populated());
  assert.match(store.recovery!, /backup-2/);
  assert.equal(
    readFileSync(
      join(
        d,
        readdirSync(d).find((n) => n.includes('.corrupt-'))!,
      ),
      'utf8',
    ),
    'broken original bytes',
  );
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), populated());
});
test('rolling backups are bounded and a missing primary can recover after an interrupted replacement', () => {
  const d = dir(),
    file = join(d, 'progress.json'),
    store = createProgressStore(d);
  for (let n = 0; n < 8; n++) {
    store.get().lastVisited = 'step-' + n;
    store.flush();
  }
  assert.equal(readdirSync(d).filter((n) => n.includes('.backup-')).length, 5);
  assert.equal(JSON.parse(readFileSync(file + '.backup-1', 'utf8')).lastVisited, 'step-6');
  unlinkSync(file);
  writeFileSync(file + '.tmp', 'incomplete');
  assert.equal(createProgressStore(d).get().lastVisited, 'step-6');
});
test('corruption appearing after load cannot be overwritten by a cached save', () => {
  const d = dir(),
    file = join(d, 'progress.json'),
    store = createProgressStore(d);
  store.get();
  store.flush();
  writeFileSync(file, 'damaged externally');
  store.get().lastVisited = 'new';
  assert.throws(() => store.flush());
  assert.equal(readFileSync(file, 'utf8'), 'damaged externally');
});

test('an unsupported primary version is never rolled back to an older valid backup', () => {
  const d = dir(),
    file = join(d, 'progress.json'),
    newer = JSON.stringify({ ...populated(), version: 2 });
  writeFileSync(file, newer);
  writeFileSync(file + '.backup-1', JSON.stringify(populated()));
  assert.throws(() => createProgressStore(d).get(), /compatible Forge version/);
  assert.equal(readFileSync(file, 'utf8'), newer);
});
test('an interrupted first save recovers a complete temporary file and refuses a truncated one', () => {
  const d = dir(),
    file = join(d, 'progress.json');
  writeFileSync(file + '.tmp', JSON.stringify(populated()));
  assert.deepEqual(createProgressStore(d).get(), populated());
  const broken = dir();
  writeFileSync(join(broken, 'progress.json.tmp'), '{incomplete');
  assert.throws(() => createProgressStore(broken).get(), /NOT been reset/);
});
