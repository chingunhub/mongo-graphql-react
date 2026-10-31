import type { Curriculum } from './content.js';
import type { Progress } from './progress.js';

const DAY = 86_400_000;
/** Days to wait after 0, 1 and 2 right answers. After the third, a card is retired. */
const INTERVALS = [3, 7, 21];
const SESSION_SIZE = 3;
/** Someone back after a missed week gets a longer warm-up. */
const RETURNING_SIZE = 5;
const RETURNING_GAP = 7;

export type ReviewOutcome = 'right' | 'wrong' | 'skip';

export type ReviewCard =
  | { kind: 'quiz'; id: string; due: string; source: string; lesson: { key: string; title: string } }
  | { kind: 'drill'; id: string; due: string; key: string; title: string; summary: string };

export function quizzesIn(body: string): string[] {
  return [...body.matchAll(/^```quiz\r?\n([\s\S]*?)^```/gm)].map((match) => match[1].replace(/\r\n/g, '\n').trim());
}

const addDays = (from: Date | string, days: number) => new Date(new Date(from).getTime() + days * DAY).toISOString();
const localDay = (date: Date) => date.toLocaleDateString('en-CA');

/** Everything finished so far, each with the date it next comes due. Retired cards are left out. */
function pool(cur: Curriculum, p: Progress): ReviewCard[] {
  const cards: ReviewCard[] = [];
  const due = (id: string, learnedAt: string) => p.review.entries[id]?.due ?? addDays(learnedAt, INTERVALS[0]);
  const retired = (id: string) => (p.review.entries[id]?.stage ?? 0) >= INTERVALS.length;
  for (const item of cur.byKey.values()) {
    if (item.kind === 'lesson') {
      const doneAt = p.lessons[item.key]?.doneAt;
      if (!doneAt) continue;
      quizzesIn(item.body).forEach((source, n) => {
        const id = `quiz:${item.key}:${n}`;
        if (retired(id)) return;
        cards.push({
          kind: 'quiz',
          id,
          due: due(id, doneAt),
          source,
          lesson: { key: item.key, title: item.title },
        });
      });
    } else if (item.kind === 'drill') {
      const passedAt = p.items[item.key]?.passedAt;
      const id = `drill:${item.key}`;
      if (!passedAt || retired(id)) continue;
      cards.push({
        kind: 'drill',
        id,
        due: due(id, passedAt),
        key: item.key,
        title: item.title,
        summary: item.summary,
      });
    }
  }
  return cards;
}

function daysSinceActive(p: Progress, now: Date): number {
  const times = [
    ...Object.values(p.lessons).map((lesson) => lesson.doneAt),
    ...Object.values(p.items).flatMap((item) => item.lastResult?.at ?? []),
    ...Object.values(p.review.entries).map((entry) => entry.at),
  ].map((at) => new Date(at).getTime());
  if (!times.length) return 0;
  return Math.floor((now.getTime() - Math.max(...times)) / DAY);
}

/** The oldest due cards, at most one per lesson so the session stays mixed, with one drill at the end. */
export function reviewSession(cur: Curriculum, p: Progress, now = new Date()) {
  const gapDays = daysSinceActive(p, now);
  if (p.review.restedOn === localDay(now)) return { cards: [], gapDays };
  const size = gapDays >= RETURNING_GAP ? RETURNING_SIZE : SESSION_SIZE;
  const due = pool(cur, p)
    .filter((card) => new Date(card.due) <= now)
    .sort((a, b) => a.due.localeCompare(b.due));
  const lessons = new Set<string>();
  const quizzes = due.filter((card) => {
    if (card.kind !== 'quiz' || lessons.has(card.lesson.key)) return false;
    lessons.add(card.lesson.key);
    return true;
  });
  const drill = due.find((card) => card.kind === 'drill');
  const cards = drill ? [...quizzes.slice(0, size - 1), drill] : quizzes.slice(0, size);
  return { cards, gapDays };
}

/** Moves one card along. Returns false for a card that isn't in the pool. */
export function applyReview(cur: Curriculum, p: Progress, id: string, outcome: ReviewOutcome, now = new Date()) {
  if (!['right', 'wrong', 'skip'].includes(outcome)) return false;
  if (!pool(cur, p).some((card) => card.id === id)) return false;
  const stage = p.review.entries[id]?.stage ?? 0;
  const at = now.toISOString();
  if (outcome === 'skip') p.review.entries[id] = { stage, due: addDays(now, 1), at };
  else if (outcome === 'wrong') p.review.entries[id] = { stage: 0, due: addDays(now, INTERVALS[0]), at };
  else p.review.entries[id] = { stage: stage + 1, due: addDays(now, INTERVALS[stage + 1] ?? 0), at };
  return true;
}

export function restReview(p: Progress, now = new Date()) {
  p.review.restedOn = localDay(now);
}
