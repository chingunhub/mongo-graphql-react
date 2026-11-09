import test from 'node:test';
import assert from 'node:assert/strict';
import { cumulative, isTaskLocal, loadCurriculum, taskSolution, taskStart, type TaskItem } from '../server/content';
import { finaleFiles, taskforgeLaunch, taskforgeSource } from '../server/taskforge-source';
import {
  taskforgeJourney,
  taskforgeJourneyOptions,
  taskforgeLayers,
  taskforgePieces,
  taskforgeStages,
} from '../shared/taskforge';
import { afterThis, describeItems } from '../web/src/components/moduleProgress';
import type { ModuleSummary } from '../web/src/api';
import type { Progress } from '../server/progress';

const cur = loadCurriculum();
const steps = cur.workspaces.get('taskforge') as TaskItem[];
const blank = (): Progress => ({
  version: 1,
  items: {},
  lessons: {},
  workspaces: {},
  settings: { unlockAll: false },
});
const passed = (p: Progress, keys: string[]) => {
  for (const key of keys) p.items[key] = { status: 'passed' } as Progress['items'][string];
  return p;
};
const upTo = (count: number) =>
  passed(
    blank(),
    steps.slice(0, count).map((s) => s.key),
  );

test('every map piece and journey stop points at something real', () => {
  const full = taskforgeSource(cur, upTo(steps.length), 'reference');
  assert.equal(new Set(taskforgePieces.map((p) => p.id)).size, taskforgePieces.length);
  for (const layer of taskforgeLayers)
    for (const piece of layer.pieces) {
      assert.ok(Object.hasOwn(full.files, piece.file), piece.file);
      if (piece.step) assert.equal(cur.byKey.get(piece.step)?.kind, 'forge', piece.step);
      if (piece.lesson) assert.equal(cur.byKey.get(piece.lesson)?.kind, 'lesson', piece.lesson);
    }
  for (const { id } of taskforgeJourneyOptions)
    for (const frame of taskforgeJourney(id))
      assert.ok(
        taskforgePieces.some((p) => p.id === frame.at),
        frame.at,
      );
});

test('the reference view is the finished project, whatever you have passed', () => {
  const finished = cumulative(cur, 'taskforge', steps.length);
  for (const count of [0, 5, steps.length]) assert.deepEqual(taskforgeSource(cur, upTo(count), 'reference').files, finished);
});

test('a passed step after a gap does not unlock a run past that gap', () => {
  const p = passed(blank(), [steps[0].key, steps[1].key, steps[4].key, steps[7].key]);
  assert.equal(taskforgeSource(cur, p, 'reference').passed, 2);
  assert.equal(taskforgeLaunch(cur, p).stage, null);
});

test('my view shows saved code and never a solution', () => {
  const p = upTo(5);
  p.workspaces.taskforge = { files: { 'server/models/Issue.ts': '// my issue' }, updatedAt: 'before' };
  const before = JSON.stringify(p);
  const mine = taskforgeSource(cur, p, 'mine');
  assert.equal(mine.files['server/models/Issue.ts'], '// my issue');
  assert.equal(mine.entries.find((e) => e.path === 'server/models/Issue.ts')?.origin, 'saved');
  assert.equal(JSON.stringify(p), before);
  const starters = new Set(steps.flatMap((s) => Object.values(s.starter)));
  for (const step of steps.slice(5))
    for (const [path, code] of Object.entries(step.solution))
      if (!starters.has(code)) assert.notEqual(mine.files[path], code, path);
});

test('a file many steps touch points at the next step that needs it', () => {
  const issue = taskforgeSource(cur, upTo(2), 'mine').entries.find((e) => e.path === 'server/models/Issue.ts');
  assert.equal(issue?.step, steps.slice(2).find((s) => 'server/models/Issue.ts' in s.solution)?.key);
});

test('stages unlock from module 7, one at a time, in build order', () => {
  const index = (key: string) => steps.findIndex((s) => s.key === key);
  const positions = taskforgeStages.map((s) => index(s.from));
  assert.ok(positions.every((p) => p >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  assert.equal(taskforgeLaunch(cur, upTo(index('m07/f7-resolvers'))).stage, null);
  for (const [i, stage] of taskforgeStages.entries()) {
    const info = taskforgeLaunch(cur, upTo(positions[i] + 1));
    assert.equal(info.stage?.id, stage.id);
    assert.equal(info.next?.stage.id, taskforgeStages[i + 1]?.id);
  }
  assert.equal(taskforgeLaunch(cur, upTo(5)).next?.stepsAway, positions[0] - 5 + 1);
});

test('tasks on a finished project start from the whole project plus their own files', () => {
  const whole = cumulative(cur, 'taskforge', steps.length);
  for (const key of ['m13/b1-stale-names', 'm13/d1-pin-issues']) {
    const task = cur.byKey.get(key) as TaskItem;
    assert.equal(task.base, 'taskforge');
    assert.equal(task.workspace, undefined);
    const start = taskStart(cur, task);
    for (const [path, code] of Object.entries(whole)) assert.equal(start[path], task.starter[path] ?? code, path);
    for (const [path, code] of Object.entries(task.starter)) assert.equal(start[path], code, path);
    const solved = taskSolution(cur, task);
    for (const [path, code] of Object.entries(task.solution)) assert.equal(solved[path], code, path);
  }
});

test('finished-project work only reaches the app once the build is done', () => {
  const key = 'm13/d1-pin-issues';
  const saved = { 'server/models/Issue.ts': '// pinned', 'playground.ts': '// scratch' };
  const nearly = upTo(steps.length - 1);
  nearly.items[key] = { status: 'passed', files: saved } as Progress['items'][string];
  assert.deepEqual(finaleFiles(cur, nearly), {});
  const done = upTo(steps.length);
  done.items[key] = { status: 'failed', files: saved } as Progress['items'][string];
  assert.deepEqual(finaleFiles(cur, done), {});
  done.items[key] = { status: 'passed', files: saved } as Progress['items'][string];
  assert.deepEqual(finaleFiles(cur, done), { 'server/models/Issue.ts': '// pinned' });
  assert.equal(taskforgeSource(cur, done, 'mine').files['server/models/Issue.ts'], '// pinned');
  assert.ok(isTaskLocal('playground.ts'));
});

test('a later finished-project task wins over an earlier one on the same file', () => {
  const p = upTo(steps.length);
  const path = 'server/graphql/pagination.ts';
  p.items['m13/b1-stale-names'] = { status: 'passed', files: { [path]: '// incident' } } as Progress['items'][string];
  p.items['m13/d1-pin-issues'] = { status: 'passed', files: { [path]: '// pin' } } as Progress['items'][string];
  assert.equal(finaleFiles(cur, p)[path], '// pin');
});

test('a task says what its module still holds', () => {
  const item = (kind: string, key: string, status?: string) =>
    ({ kind, key, id: key, title: key, status, done: status === 'passed' }) as ModuleSummary['items'][number];
  const mod = (id: string, number: number, items: ModuleSummary['items']) =>
    ({ id, number, title: 'T' + number, part: '', summary: '', items }) as ModuleSummary;
  const one = mod('a', 5, [
    item('forge', 'a', 'passed'),
    item('forge', 'b'),
    item('bughunt', 'c'),
    item('drill', 'd'),
  ]);
  const two = mod('b', 6, [item('forge', 'e')]);
  assert.equal(
    afterThis([one, two], one, 'a'),
    'After this: 1 drill, 1 bug hunt and 1 forge step left in module 5.',
  );
  assert.equal(afterThis([two], two, 'e'), 'Last one in the course.');
  const last = mod('a', 5, [item('forge', 'a', 'passed'), item('forge', 'b')]);
  assert.equal(afterThis([last, two], last, 'b'), 'Last one in this module. Next: module 6, T6.');
  assert.equal(describeItems([item('forge', 'a'), item('forge', 'b')]), '2 forge steps');
});
