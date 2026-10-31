import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCurriculum } from '../server/content';
import type { Progress } from '../server/progress';
import { applyReview, quizzesIn, restReview, reviewSession } from '../server/review';

const DAY = 86_400_000;
const start = new Date('2026-03-01T09:00:00.000Z');
const after = (days: number) => new Date(start.getTime() + days * DAY);

const blank = (): Progress => ({
  version: 1,
  items: {},
  lessons: {},
  workspaces: {},
  settings: { unlockAll: false },
  review: { entries: {} },
});

const cur = loadCurriculum();
const lessons = [...cur.byKey.values()].filter((item) => item.kind === 'lesson');
const withQuiz = lessons.filter((lesson) => quizzesIn(lesson.body).length > 0);
const drills = [...cur.byKey.values()].filter((item) => item.kind === 'drill');

function finished(count: number, at = start) {
  const p = blank();
  for (const lesson of withQuiz.slice(0, count)) p.lessons[lesson.key] = { doneAt: at.toISOString() };
  return p;
}

test('the review pool is the 112 lesson quizzes and the 32 drills, without the checkpoints', () => {
  assert.equal(lessons.flatMap((lesson) => quizzesIn(lesson.body)).length, 112);
  assert.equal(drills.length, 32);
});

test('nothing comes due until three days after a lesson is finished', () => {
  const p = finished(4);
  assert.equal(reviewSession(cur, p, after(2)).cards.length, 0);
  assert.equal(reviewSession(cur, p, after(3)).cards.length, 3);
});

test('unfinished lessons and unpassed drills stay out', () => {
  const p = blank();
  p.items[drills[0].key] = { status: 'started', attempts: 2, hintsShown: 0, solutionRevealed: false };
  assert.deepEqual(reviewSession(cur, p, after(30)).cards, []);
});

test('a session takes at most one quiz from a lesson', () => {
  const many = withQuiz.find((lesson) => quizzesIn(lesson.body).length > 1)!;
  const p = blank();
  p.lessons[many.key] = { doneAt: start.toISOString() };
  assert.equal(reviewSession(cur, p, after(3)).cards.length, 1);
});

test('the oldest cards come first and a due drill comes last', () => {
  const p = finished(4, after(1));
  p.lessons[withQuiz[5].key] = { doneAt: start.toISOString() };
  p.items[drills[0].key] = {
    status: 'passed',
    attempts: 1,
    hintsShown: 0,
    solutionRevealed: false,
    passedAt: start.toISOString(),
  };
  const { cards } = reviewSession(cur, p, after(5));
  assert.equal(cards.length, 3);
  assert.ok(cards[0].kind === 'quiz' && cards[0].lesson.key === withQuiz[5].key);
  assert.equal(cards[2].kind, 'drill');
});

test('a right answer waits longer each time and the third retires the card', () => {
  const p = finished(1);
  const id = reviewSession(cur, p, after(3)).cards[0].id;
  assert.ok(applyReview(cur, p, id, 'right', after(3)));
  assert.equal(p.review.entries[id].stage, 1);
  assert.equal(p.review.entries[id].due, after(10).toISOString());
  assert.ok(!reviewSession(cur, p, after(9)).cards.some((card) => card.id === id));
  assert.ok(applyReview(cur, p, id, 'right', after(10)));
  assert.equal(p.review.entries[id].due, after(31).toISOString());
  assert.ok(applyReview(cur, p, id, 'right', after(31)));
  assert.equal(p.review.entries[id].stage, 3);
  const later = reviewSession(cur, p, after(200)).cards.map((card) => card.id);
  assert.ok(!later.includes(id));
  assert.equal(applyReview(cur, p, id, 'right', after(200)), false);
});

test('a wrong answer starts the card over, and a skip only moves it to tomorrow', () => {
  const p = finished(1);
  const id = reviewSession(cur, p, after(3)).cards[0].id;
  applyReview(cur, p, id, 'right', after(3));
  applyReview(cur, p, id, 'skip', after(10));
  assert.equal(p.review.entries[id].stage, 1);
  assert.equal(p.review.entries[id].due, after(11).toISOString());
  applyReview(cur, p, id, 'wrong', after(11));
  assert.equal(p.review.entries[id].stage, 0);
  assert.equal(p.review.entries[id].due, after(14).toISOString());
});

test('after a missed week the session grows to five', () => {
  const p = finished(8);
  assert.equal(reviewSession(cur, p, after(6)).cards.length, 3);
  const back = reviewSession(cur, p, after(9));
  assert.equal(back.cards.length, 5);
  assert.equal(back.gapDays, 9);
});

test('resting clears today only', () => {
  const p = finished(4);
  restReview(p, after(5));
  assert.deepEqual(reviewSession(cur, p, after(5)).cards, []);
  assert.equal(reviewSession(cur, p, after(6)).cards.length, 3);
});

test('reviewing never touches a pass, a lesson or a saved file', () => {
  const p = finished(1);
  const before = JSON.stringify({ items: p.items, lessons: p.lessons, workspaces: p.workspaces });
  applyReview(cur, p, reviewSession(cur, p, after(3)).cards[0].id, 'wrong', after(3));
  assert.equal(JSON.stringify({ items: p.items, lessons: p.lessons, workspaces: p.workspaces }), before);
});

test('unknown cards and outcomes are refused', () => {
  const p = finished(1);
  const id = reviewSession(cur, p, after(3)).cards[0].id;
  assert.equal(applyReview(cur, p, 'quiz:m99/nope:0', 'right', after(3)), false);
  assert.equal(applyReview(cur, p, id, 'perfect' as never, after(3)), false);
  assert.deepEqual(p.review.entries, {});
});
