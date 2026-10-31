import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { loadCurriculum, taskStart, type TaskItem } from '../server/content';
import { ROOT } from '../server/paths';
import { milestones, stages } from '../shared/stages';
test('every module sits in a stage, and the stages run in course order', () => {
  const cur = loadCurriculum();
  const known = stages.map((stage) => stage.number as number);
  for (const mod of cur.modules) {
    const expected = mod.number <= 9 ? 1 : mod.number <= 13 ? 2 : 3;
    assert.equal(mod.stage, expected, mod.id + ' is in the wrong stage');
    assert.ok(known.includes(mod.stage), mod.id + ' names an unknown stage');
  }
});
test('each milestone is the last forge step of a stage', () => {
  const cur = loadCurriculum();
  const lastForge = stages.slice(0, 2).map((stage) => {
    const items = cur.modules.filter((mod) => mod.stage === stage.number).flatMap((mod) => mod.items);
    return items.filter((item) => item.kind === 'forge').at(-1)!.key;
  });
  assert.deepEqual(Object.keys(milestones), lastForge);
});
test('every expansion task exposes its focus files, hints and executable tests', () => {
  const cur = loadCurriculum();
  const tasks = [...cur.byKey.values()].filter(
    (item): item is TaskItem => item.kind !== 'lesson' && Number(item.moduleId.slice(1)) >= 14,
  );
  assert.equal(tasks.length, 30);
  for (const task of tasks) {
    const base = taskStart(cur, task);
    assert.ok(task.hints.length >= 2, task.key + ' needs progressive hints');
    assert.ok(
      Object.keys(task.tests).some((path) => /^task\.test\.tsx?$/.test(path)),
      task.key + ' needs a runnable grader',
    );
    for (const path of task.focus) assert.ok(Object.hasOwn(base, path), task.key + ': missing focus ' + path);
    for (const path of task.readonly)
      assert.ok(Object.hasOwn(base, path), task.key + ': missing helper ' + path);
    if (task.preview) assert.ok(Object.hasOwn(base, task.preview), task.key + ': missing preview');
    assert.ok(Object.keys(task.solution).length > 0, task.key + ' needs a separate reference');
  }
});
test('new lesson visual specifications parse and name supported components', () => {
  const cur = loadCurriculum();
  const bespoke = new Set([
    'tenant-cache',
    'delivery-lab',
    'stack-map',
    'objectid',
    'nullability',
    'cache',
    'blast-radius',
    'dual-write',
    'retry-lab',
  ]);
  let lessons = 0,
    visuals = 0;
  for (const item of cur.byKey.values())
    if (item.kind === 'lesson' && Number(item.moduleId.slice(1)) >= 14) {
      lessons++;
      for (const match of item.body.matchAll(/```(viz[^\n]*)\n([\s\S]*?)```/g)) {
        const [kind, name] = match[1].trim().split(/\s+/);
        assert.ok(['viz', 'viz-sequence', 'viz-flow', 'viz-tree', 'viz-pipeline'].includes(kind));
        if (kind === 'viz') assert.ok(bespoke.has(name), 'Unknown visualization ' + name);
        const spec = new Function('return (' + match[2] + ');')();
        if (kind === 'viz-sequence') {
          assert.ok(spec.actors.length);
          assert.ok(spec.steps.length);
        }
        visuals++;
      }
      assert.match(item.body, /```quiz/, item.key + ' must ask for a prediction');
    }
  assert.equal(lessons, 26);
  assert.ok(visuals >= 8);
});

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const shared = (...entries: string[]) =>
  entries
    .map((entry) => join(ROOT, entry))
    .flatMap((path) => (statSync(path).isDirectory() ? walk(path) : [path]))
    .map((path) => relative(ROOT, path).split(sep).join('/'));

// The course speaks about real repos in general. A file joins this list only when it quotes borrowed code.
const NAMES_ITS_SOURCE = [
  /^content\/m24-erxes-field-guide\//,
  /^content\/m15-tenant-boundaries\/l1-context\.md$/,
  /^content\/m18-service-contracts\/l1-runtime-contracts\.md$/,
  /^content\/m19-background-work\/l1-queues\.md$/,
  /^content\/m21-plugin-delivery\/l1-plugin-ui\.md$/,
  /^web\/src\/components\/RelaydeskPage\.tsx$/, // the link to the pinned source
  /^README\.md$/, // credits
];

test('course text names erxes only where its code is borrowed', () => {
  const stray = shared('content', 'web/src', 'server', 'sandbox', 'README.md').filter(
    (path) =>
      !NAMES_ITS_SOURCE.some((allowed) => allowed.test(path)) &&
      /erxes/i.test(readFileSync(join(ROOT, path), 'utf8')),
  );
  assert.deepEqual(stray, []);
});

test('nothing a student reads carries a path from the author\'s machine', () => {
  const leaked = shared('content', 'web/src', 'README.md')
    .filter((path) => /\.(md|json|tsx?)$/.test(path))
    .filter((path) => /[A-Z]:[\\/]Users[\\/]/.test(readFileSync(join(ROOT, path), 'utf8')));
  assert.deepEqual(leaked, []);
});

test('the license is the full AGPL text and package.json agrees', () => {
  assert.ok(existsSync(join(ROOT, 'LICENSE')));
  const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
  assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  assert.equal(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).license, 'AGPL-3.0-only');
});
test('every Stage 1 task links back to the lessons it depends on', () => {
  const cur = loadCurriculum();
  const tasks = cur.modules
    .filter((mod) => mod.stage === 1)
    .flatMap((mod) => mod.items)
    .filter((item): item is TaskItem => item.kind !== 'lesson');
  assert.equal(tasks.length, 30);
  for (const task of tasks) {
    assert.ok(task.needs.length >= 1 && task.needs.length <= 2, task.key + ' needs one or two lessons');
    for (const key of task.needs) {
      assert.equal(cur.byKey.get(key)?.kind, 'lesson', task.key + ' links to ' + key);
      assert.ok(cur.modules.flatMap((mod) => mod.items).findIndex((item) => item.key === key) <
        cur.modules.flatMap((mod) => mod.items).findIndex((item) => item.key === task.key), task.key + ' links ahead to ' + key);
    }
  }
});
test('both checkpoints are real lessons with sourced, answerable questions', () => {
  const cur = loadCurriculum();
  for (const key of ['m05/l3-checkpoint', 'm09/l5-checkpoint']) {
    const lesson = cur.byKey.get(key);
    assert.equal(lesson?.kind, 'lesson', key);
    const source = /^```checkpoint\r?\n([\s\S]*?)^```/m.exec(lesson!.kind === 'lesson' ? lesson!.body : '');
    assert.ok(source, key + ' has no checkpoint block');
    const questions = source![1].split(/^---$/m);
    assert.equal(questions.length, 10, key);
    for (const question of questions) {
      const lines = question.trim().split(/\r?\n/);
      const label = key + ': ' + lines[0];
      assert.match(lines[0], /^Q: /, label);
      assert.match(lines[1], /^L: /, label);
      assert.equal(cur.byKey.get(lines[1].slice(3))?.kind, 'lesson', label);
      assert.equal(lines.filter((line) => line.startsWith('- [x] ')).length, 1, label);
      assert.ok(lines.filter((line) => line.startsWith('- [ ] ')).length >= 2, label);
      assert.ok(lines.some((line) => line.startsWith('> ')), label);
    }
  }
});
test('the nine concept lessons connect the new idea to something already known', () => {
  const cur = loadCurriculum();
  const bridged = [...cur.byKey.values()].filter(
    (item) => item.kind === 'lesson' && item.body.includes('[!BRIDGE]'),
  );
  assert.deepEqual(
    bridged.map((item) => item.key),
    [
      'm02/l1-validation',
      'm03/l1-queries',
      'm04/l1-embed-or-reference',
      'm05/l1-hooks-methods',
      'm05/l2-aggregation',
      'm06/l1-what-is-graphql',
      'm07/l1-resolver-anatomy',
      'm08/l1-context-auth',
      'm08/l2-errors',
    ],
  );
});
