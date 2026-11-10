import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { loadCurriculum, taskStart, type TaskItem } from '../server/content';
import { emptyProgress } from '../server/progress-store';
import { reviewAttempt, gradeReview, mountReviewWorkbench } from '../server/review-workbench';
import { applyReview } from '../server/review';
import { runJob } from '../server/runner';
import { saveBody } from '../web/src/api';

const cur = loadCurriculum(),
  task = cur.byKey.get('m00/d1-warmup') as TaskItem;
const now = new Date('2026-10-15T00:00:00Z'),
  learned = '2026-10-01T00:00:00Z';
function learnedProgress() {
  const p = emptyProgress();
  p.items[task.key] = {
    status: 'passed',
    attempts: 7,
    hintsShown: 2,
    solutionRevealed: true,
    passedAt: learned,
    files: { 'board.ts': '// my original solution' },
  };
  p.workspaces.taskforge = {
    files: { 'app.ts': '// my project' },
    updatedAt: learned,
  };
  return p;
}
const original = (p: ReturnType<typeof learnedProgress>) =>
  JSON.stringify({
    items: p.items,
    workspaces: p.workspaces,
    lessons: p.lessons,
  });
const output = (ok: boolean) => ({
  mode: 'test' as const,
  ok,
  logs: [],
  results: [{ name: 'behavior', passed: ok, ms: 1 }],
  ms: 1,
});
test('opening a drill uses starter files, keeps original work and grants no recall credit', () => {
  const p = learnedProgress(),
    before = original(p);
  const a = reviewAttempt(cur, p, task, now);
  assert.deepEqual(a.files, taskStart(cur, task));
  assert.deepEqual(p.review.entries, {});
  assert.equal(original(p), before);
  assert.equal(applyReview(cur, p, 'drill:' + task.key, 'right', now), false);
  assert.equal(reviewAttempt(cur, p, task, now), a);
});
test('only the first graded recall changes the schedule; failures and assisted attempts need practice', () => {
  const p = learnedProgress(),
    before = original(p),
    a = reviewAttempt(cur, p, task, now);
  gradeReview(cur, p, task, a, output(false), now);
  assert.equal(p.review.entries['drill:' + task.key].stage, 0);
  gradeReview(cur, p, task, a, output(true), now);
  assert.equal(p.review.entries['drill:' + task.key].stage, 0);
  assert.equal(a.status, 'passed');
  assert.equal(original(p), before);
  const next = reviewAttempt(cur, p, task, new Date('2026-10-18T00:00:00Z'));
  assert.notEqual(next, a);
  gradeReview(cur, p, task, next, output(true), new Date('2026-10-18T00:00:00Z'));
  gradeReview(cur, p, task, next, output(true), new Date('2026-10-18T00:00:00Z'));
  assert.equal(p.review.entries['drill:' + task.key].stage, 1);
  const assisted = learnedProgress(),
    practice = reviewAttempt(cur, assisted, task, now);
  practice.hintsShown = 1;
  gradeReview(cur, assisted, task, practice, output(true), now);
  assert.equal(assisted.review.entries['drill:' + task.key].stage, 0);
});
test('the review routes grade a real starter and solution while protecting course files and counters', async () => {
  const p = learnedProgress(),
    before = original(p);
  const app = express();
  app.use(express.json());
  mountReviewWorkbench(app, {
    curriculum: () => cur,
    readonlyPaths: (t) => t.readonly,
    progress: () => p,
    save: () => {},
    run: runJob,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + (server.address() as any).port + '/api/review/items/' + task.key;
  try {
    const data = await (await fetch(base)).json();
    assert.deepEqual(p.review.entries, {});
    const post = async (op: string, body: Record<string, unknown> = {}) => {
      const res = await fetch(base + '/' + op, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cycle: data.reviewCycle, ...body }),
      });
      assert.equal(res.status, 200, await res.clone().text());
      return res.json();
    };
    const failed = await post('submit', { files: data.files });
    assert.equal(failed.ok, false);
    const solution = { ...taskStart(cur, task), ...task.solution };
    await post('save', saveBody(solution, { editor: 'test', revision: 2 }, data.reviewCycle));
    await post('save', {
      files: data.files,
      version: { editor: 'test', revision: 1 },
    });
    const passed = await post('submit', { files: solution });
    assert.equal(passed.ok, true);
    await post('submit', { files: solution });
    assert.equal(p.review.entries['drill:' + task.key].stage, 0);
    await post('hint');
    await post('solution');
    const reset = await post('reset', { path: 'board.ts' });
    assert.equal(reset.content, data.files['board.ts']);
    assert.equal((await (await fetch(base)).json()).files['board.ts'], solution['board.ts']);
    assert.equal(original(p), before);
    const stale = await fetch(base + '/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cycle: 'old', files: { 'board.ts': 'stale' } }),
    });
    assert.equal(stale.status, 409);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test('all eligible drill reviews retain their real starter structure, including the cumulative finale', () => {
  const p = emptyProgress();
  for (const item of cur.byKey.values())
    if (item.kind === 'drill') {
      p.items[item.key] = {
        status: 'passed',
        attempts: 1,
        hintsShown: 0,
        solutionRevealed: false,
        passedAt: learned,
      };
      const a = reviewAttempt(cur, p, item, now);
      assert.deepEqual(a.files, taskStart(cur, item), item.key);
      assert.ok(Object.keys(a.files).length > 0, item.key);
    }
});

for (const key of ['m01/d1-recipe-model', 'm10/d1-project-picker'])
  test('review grader preserves the real environment: ' + key, async () => {
    const item = cur.byKey.get(key) as TaskItem,
      p = emptyProgress();
    p.items[key] = {
      status: 'passed',
      attempts: 4,
      hintsShown: 1,
      solutionRevealed: true,
      passedAt: learned,
      files: { sentinel: 'keep original' },
    };
    const before = original(p),
      a = reviewAttempt(cur, p, item, now);
    const failed = await runJob({
      mode: 'test',
      files: a.files,
      tests: item.tests,
      env: item.env,
      db: item.db,
    });
    assert.equal(failed.ok, false, 'starter must demand independent work');
    const passed = await runJob({
      mode: 'test',
      files: { ...a.files, ...item.solution },
      tests: item.tests,
      env: item.env,
      db: item.db,
    });
    assert.equal(passed.ok, true, JSON.stringify(passed));
    gradeReview(cur, p, item, a, passed, now);
    assert.equal(p.review.entries['drill:' + key].stage, 1);
    assert.equal(original(p), before);
  });
