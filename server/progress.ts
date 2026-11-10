import type { Language } from '../shared/languages.js';
import { createProgressStore } from './progress-store.js';
import { DATA_DIR } from './paths.js';
import type { Files } from './runner.js';

export interface ItemProgress {
  status: 'started' | 'passed';
  attempts: number;
  hintsShown: number;
  solutionRevealed: boolean;
  passedAt?: string;
  lastResult?: { passed: number; total: number; at: string };
  /** Drills: all editable files. Forge steps: only task-local files (playground). */
  files?: Files;
}

export interface ReviewEntry {
  /** Reviews answered right so far. */
  stage: number;
  due: string;
  at: string;
}

export interface ReviewAttempt extends ItemProgress {
  cycle: string;
  files: Files;
  reviewOutcome?: 'right' | 'wrong';
}

export interface Progress {
  version: 1;
  items: Record<string, ItemProgress>;
  lessons: Record<string, { doneAt: string }>;
  workspaces: Record<string, { files: Files; updatedAt: string }>;
  settings: {
    unlockAll: boolean;
    language?: Language;
    /** The mentor provider and model last used. Never the key. */
    mentor?: { provider: string; model?: string };
  };
  /** Spaced review, kept apart from pass or fail. */
  review: { entries: Record<string, ReviewEntry>; restedOn?: string; attempts?: Record<string, ReviewAttempt> };
  lastVisited?: string;
}

const store = createProgressStore(DATA_DIR);
export const getProgress = store.get;
export const saveProgress = store.save;
export const flush = store.flush;
export const progressRecovery = () => store.recovery;

export function itemProgress(key: string): ItemProgress {
  const p = getProgress();
  return (p.items[key] ??= { status: 'started', attempts: 0, hintsShown: 0, solutionRevealed: false });
}

export function peekItem(key: string): ItemProgress | undefined {
  return getProgress().items[key];
}

/**
 * The one rule for the reference answer: open once the step has passed or after 3 submitted
 * attempts. The Solution button and the mentor's read_reference tool both go through it.
 */
export function solutionAvailable(ip: ItemProgress | undefined): boolean {
  return ip?.status === 'passed' || (ip?.attempts ?? 0) >= 3;
}
