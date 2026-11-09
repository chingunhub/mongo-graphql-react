// What the learner does in the app, for a running voice call to follow: opening an item, saving,
// submitting, running the playground, opening a hint or the solution. The app's routes emit; voice
// listens. Nothing listens without a call, so emitting costs nothing.
import type { Item } from '../content.js';
import type { RunOutput } from '../runner.js';

export type Activity =
  | { type: 'open'; item: Item }
  | { type: 'save'; item: Item; files: Record<string, string> }
  | { type: 'run'; item: Item; out: RunOutput }
  | { type: 'submit'; item: Item; out: RunOutput; attempts: number }
  | { type: 'hint'; item: Item; shown: number; total: number; text: string }
  | { type: 'solution'; item: Item };

const listeners = new Set<(a: Activity) => void>();

export function onActivity(fn: (a: Activity) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function emitActivity(a: Activity) {
  for (const fn of listeners) {
    try {
      fn(a);
    } catch (e) {
      console.warn('[mentor] activity listener failed:', (e as Error).message);
    }
  }
}
