import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCurriculum } from '../server/content';
import { exportProgress } from '../server/progress-export';
import type { Progress } from '../server/progress';

const course = loadCurriculum();
const lessons = course.modules.flatMap((m) => m.items).filter((item) => item.kind === 'lesson');
const tasks = course.modules.flatMap((m) => m.items).filter((item) => item.kind !== 'lesson');
const SECRET = 'const password = "do-not-send";';

const progress = (): Progress => ({
  version: 1,
  items: {
    [tasks[0].key]: {
      status: 'passed',
      attempts: 3,
      hintsShown: 1,
      solutionRevealed: false,
      passedAt: '2026-10-02T10:00:00.000Z',
      lastResult: { passed: 9, total: 9, at: '2026-10-02T10:00:00.000Z' },
      files: { 'models/User.ts': SECRET },
    },
    [tasks[1].key]: {
      status: 'started',
      attempts: 1,
      hintsShown: 2,
      solutionRevealed: true,
      lastResult: { passed: 1, total: 4, at: '2026-10-03T10:00:00.000Z' },
      files: { 'playground.ts': SECRET },
    },
  },
  lessons: { [lessons[0].key]: { doneAt: '2026-10-01T10:00:00.000Z' } },
  workspaces: { taskforge: { files: { 'server.ts': SECRET }, updatedAt: '2026-10-04T10:00:00.000Z' } },
  settings: { unlockAll: true, language: 'mn' },
  review: { entries: { 'quiz:a:0': { stage: 1, due: '2026-11-01', at: '2026-10-01' } } },
  lastVisited: tasks[1].key,
});

test('the export carries no code, at any depth', () => {
  const text = JSON.stringify(exportProgress(course, progress()));
  assert.ok(!text.includes('do-not-send'));
  assert.ok(!text.includes('models/User.ts'));
  assert.ok(!text.includes('"files"'));
  assert.ok(!text.includes('"workspaces"'));
});

test('a field added to progress later stays out until someone picks it', () => {
  const p = progress();
  Object.assign(p.items[tasks[0].key], { draft: SECRET });
  Object.assign(p.items[tasks[0].key].lastResult!, { output: SECRET });
  Object.assign(p.lessons[lessons[0].key], { notes: SECRET });
  assert.ok(!JSON.stringify(exportProgress(course, p)).includes('do-not-send'));
});

test('it reports attempts, hints, dates and revealed solutions', () => {
  const { items } = exportProgress(course, progress());
  const row = items.find((item) => item.key === tasks[0].key);
  assert.deepEqual(row, {
    key: tasks[0].key,
    kind: tasks[0].kind,
    status: 'passed',
    attempts: 3,
    hintsShown: 1,
    solutionRevealed: false,
    passedAt: '2026-10-02T10:00:00.000Z',
    lastResult: { passed: 9, total: 9, at: '2026-10-02T10:00:00.000Z' },
  });
  assert.deepEqual(
    items.find((item) => item.key === lessons[0].key),
    { key: lessons[0].key, kind: 'lesson', doneAt: '2026-10-01T10:00:00.000Z' },
  );
});

test('the summary says how far they got and where they stopped', () => {
  const { summary, language } = exportProgress(course, progress());
  assert.equal(language, 'mn');
  assert.equal(summary.total, course.byKey.size);
  assert.equal(summary.done, 2);
  assert.equal(summary.stages.reduce((sum, stage) => sum + stage.total, 0), summary.total);
  assert.equal(summary.stages.reduce((sum, stage) => sum + stage.done, 0), 2);
  assert.equal(summary.lastActive, '2026-10-04T10:00:00.000Z');
  assert.equal(summary.solutionsRevealed, 1);
  assert.equal(summary.reviewCards, 1);
});

test('where they stopped is after the furthest item, not at something skipped earlier', () => {
  const p = progress();
  const all = course.modules.flatMap((m) => m.items);
  const late = all.find((item, i) => item.kind !== 'lesson' && i > 20)!;
  const after = all[all.indexOf(late) + 1];
  p.items[late.key] = { status: 'passed', attempts: 1, hintsShown: 0, solutionRevealed: false };
  const { summary } = exportProgress(course, p);
  assert.equal(summary.furthest, late.key);
  assert.equal(summary.next, after.key);

  const done = Object.fromEntries(
    all.filter((item) => item.kind === 'lesson').map((item) => [item.key, { doneAt: '2026-10-01T10:00:00.000Z' }]),
  );
  const items = Object.fromEntries(
    all
      .filter((item) => item.kind !== 'lesson')
      .map((item) => [item.key, { status: 'passed' as const, attempts: 1, hintsShown: 0, solutionRevealed: false }]),
  );
  const finished = exportProgress(course, { ...p, items, lessons: done }).summary;
  assert.equal(finished.done, finished.total);
  assert.equal(finished.next, null);
});

test('a key the course no longer has is left out, and a fresh start still exports', () => {
  const p = progress();
  p.items['m99/gone'] = { status: 'passed', attempts: 1, hintsShown: 0, solutionRevealed: false };
  p.lessons['m99/gone-lesson'] = { doneAt: '2026-10-01T10:00:00.000Z' };
  const text = JSON.stringify(exportProgress(course, p));
  assert.ok(!text.includes('m99'));

  const fresh = exportProgress(course, {
    version: 1,
    items: {},
    lessons: {},
    workspaces: {},
    settings: { unlockAll: false },
    review: { entries: {} },
  });
  assert.equal(fresh.language, 'en');
  assert.equal(fresh.summary.done, 0);
  assert.equal(fresh.summary.lastActive, null);
  assert.equal(fresh.summary.next, course.modules[0].items[0].key);
  assert.deepEqual(fresh.items, []);
});

test('an installed copy names its version and a checkout names none', () => {
  const root = mkdtempSync(join(tmpdir(), 'forge-export-'));
  try {
    assert.equal(exportProgress(course, progress(), root).app, null);
    writeFileSync(join(root, 'installed.json'), JSON.stringify({ version: '0.1.0', release: 'file:' }));
    assert.equal(exportProgress(course, progress(), root).app, '0.1.0');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
