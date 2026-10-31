import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCurriculum, type TaskItem } from '../server/content';
import type { Progress } from '../server/progress';
import { reviewSession } from '../server/review';
import { checkModule, checkPage, sourceHash } from './tools/translation-check';
import { isLanguage } from '../shared/languages';

const SAMPLE = 'm01/l1-mongodb-in-10';

const english = `---
title: Sample
---

Use \`find\` here. See [the docs](/learn/m01/l1).

\`\`\`js
const a = 1; // one
\`\`\`

> [!NOTE]
> Careful.

\`\`\`quiz
Q: Which?
- [ ] \`a\`
- [x] \`b\`
> Because \`b\`.
\`\`\`

\`\`\`viz-flow
{ nodes: [{ id: 'a', label: 'first' }], edges: [] }
\`\`\`
`;

const good = english
  .replace('title: Sample', `title: Жишээ\nsource: ${sourceHash(english)}`)
  .replace('Use `find` here.', 'Энд `find` хэрэглэ.')
  .replace('Careful.', 'Болгоомжтой.')
  .replace('Which?', 'Аль нь?')
  .replace("label: 'first'", "label: 'эхний'");

test('a faithful translation has no problems, and line endings do not matter', () => {
  assert.deepEqual(checkPage(english, good), []);
  assert.deepEqual(checkPage(english.replace(/\n/g, '\r\n'), good), []);
});

const broken: [string, string, RegExp][] = [
  ['changed code', 'const a = 1; // one', /the code changed/],
  ['a moved answer', '- [ ] `a`\n- [x] `b`', /right answer changed/],
  ['changed code in an option', '- [x] `b`', /code in an option/],
  ['changed inline code', 'Энд `find`', /inline code changed/],
  ['a lost link', '[the docs](/learn/m01/l1)', /links changed/],
  ['a lost callout', '> [!NOTE]', /callouts changed/],
  ['a changed node id', "id: 'a'", /value changed/],
];

const swaps: Record<string, string> = {
  'changed code': 'const a = 2; // one',
  'a moved answer': '- [x] `a`\n- [ ] `b`',
  'changed code in an option': '- [x] `c`',
  'changed inline code': 'Энд `findOne`',
  'a lost link': 'баримт',
  'a lost callout': '> [!TIP]',
  'a changed node id': "id: 'b'",
};

for (const [name, from, problem] of broken) {
  test(`the check catches ${name}`, () => {
    assert.ok(good.includes(from), from);
    const problems = checkPage(english, good.replace(from, swaps[name]));
    assert.ok(problems.some((p) => problem.test(p)), problems.join('; ') || 'no problems');
  });
}

test('the check flags a page whose English moved on', () => {
  const problems = checkPage(english + '\nA new paragraph.\n', good);
  assert.ok(problems.some((p) => p.startsWith('outdated')));
});

test('the check notices a task that loses the hints heading', () => {
  const task = (hints: string) => `---\ntitle: T\nsummary: S\nsource: x\n---\n\nDo it.\n\n${hints}\n\n### One\n\nLook.\n`;
  const source = task('## Hints');
  const page = task('## Hints').replace('source: x', `source: ${sourceHash(source)}`);
  assert.deepEqual(checkPage(source, page), []);
  const problems = checkPage(source, page.replace('## Hints', '## Зөвлөгөө'));
  assert.ok(problems.some((p) => p.includes('## Hints')));
});

test('a translated module.json needs its words and an up to date hash', () => {
  const source = '{"title":"A"}';
  assert.deepEqual(checkModule(source, JSON.stringify({ title: 'Б', summary: 'В', source: sourceHash(source) })), []);
  assert.equal(checkModule(source, JSON.stringify({ title: 'Б', source: 'old' })).length, 2);
});

test('another language changes the words and nothing a task runs', () => {
  const en = loadCurriculum();
  const mn = loadCurriculum('mn');
  assert.deepEqual([...mn.byKey.keys()], [...en.byKey.keys()]);
  for (const [key, item] of en.byKey) {
    const other = mn.byKey.get(key)!;
    assert.equal(other.kind, item.kind);
    if (item.kind === 'lesson') continue;
    const task = other as TaskItem;
    assert.deepEqual(task.starter, item.starter);
    assert.deepEqual(task.solution, item.solution);
    assert.deepEqual(task.tests, item.tests);
    assert.equal(task.step, item.step);
  }
});

test('a translated page replaces the English one, and the others stay English', () => {
  const en = loadCurriculum();
  const mn = loadCurriculum('mn');
  const sample = mn.byKey.get(SAMPLE)!;
  assert.notEqual(sample.title, en.byKey.get(SAMPLE)!.title);
  assert.notEqual(mn.modules[1].title, en.modules[1].title);
  assert.equal(mn.modules[1].part, en.modules[1].part);
  assert.deepEqual(mn.byKey.get('m24/d5-plugin'), en.byKey.get('m24/d5-plugin'));
  assert.equal(mn.modules.at(-1)!.title, en.modules.at(-1)!.title);
});

test('review cards keep their ids across languages, so switching loses no schedule', () => {
  const finished: Progress = {
    version: 1,
    items: {},
    lessons: { [SAMPLE]: { doneAt: '2026-03-01T09:00:00.000Z' } },
    workspaces: {},
    settings: { unlockAll: false, language: 'mn' },
    review: { entries: {} },
  };
  const now = new Date('2026-03-05T09:00:00.000Z');
  const en = reviewSession(loadCurriculum(), finished, now).cards;
  const mn = reviewSession(loadCurriculum('mn'), finished, now).cards;
  assert.ok(en.length > 0);
  assert.deepEqual(mn.map((card) => card.id), en.map((card) => card.id));
  const [first] = mn;
  assert.ok(first.kind === 'quiz' && /[а-яөү]/i.test(first.source));
});

test('only known languages count', () => {
  assert.ok(isLanguage('mn'));
  assert.ok(!isLanguage('fr'));
  assert.ok(!isLanguage(undefined));
});
