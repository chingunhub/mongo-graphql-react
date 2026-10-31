import type { Language } from '../shared/languages.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

export interface Progress {
  version: 1;
  items: Record<string, ItemProgress>;
  lessons: Record<string, { doneAt: string }>;
  workspaces: Record<string, { files: Files; updatedAt: string }>;
  settings: { unlockAll: boolean; language?: Language };
  /** Spaced review, kept apart from pass or fail. */
  review: { entries: Record<string, ReviewEntry>; restedOn?: string };
  lastVisited?: string;
}

const FILE = join(DATA_DIR, 'progress.json');

function empty(): Progress {
  return {
    version: 1,
    items: {},
    lessons: {},
    workspaces: {},
    settings: { unlockAll: false },
    review: { entries: {} },
  };
}

let cache: Progress | null = null;

export function getProgress(): Progress {
  if (cache) return cache;
  if (!existsSync(FILE)) return (cache = empty());
  try {
    cache = { ...empty(), ...JSON.parse(readFileSync(FILE, 'utf8')) } as Progress;
  } catch {
    cache = empty();
  }
  return cache;
}

let timer: NodeJS.Timeout | null = null;
export function saveProgress() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 150);
}

export function flush() {
  if (!cache) return;
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(cache, null, 1));
  renameSync(tmp, FILE);
}

export function itemProgress(key: string): ItemProgress {
  const p = getProgress();
  return (p.items[key] ??= { status: 'started', attempts: 0, hintsShown: 0, solutionRevealed: false });
}

export function peekItem(key: string): ItemProgress | undefined {
  return getProgress().items[key];
}
