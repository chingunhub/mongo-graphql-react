import {
  existsSync,
  mkdirSync,
  readFileSync,
  copyFileSync,
  renameSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Progress } from './progress.js';

export const emptyProgress = (): Progress => ({
  version: 1,
  items: {},
  lessons: {},
  workspaces: {},
  settings: { unlockAll: false },
  review: { entries: {} },
});
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const files = (v: unknown) => record(v) && Object.values(v).every((x) => typeof x === 'string');
const count = (v: unknown) => Number.isInteger(v) && Number(v) >= 0;
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));

class UnsupportedProgressVersion extends Error {}

/** Reject damaged state instead of treating it as an empty course. Old v1 optional fields get defaults. */
export function parseProgress(text: string): Progress {
  const p = JSON.parse(text);
  if (record(p) && typeof p.version === 'number' && p.version !== 1) {
    throw new UnsupportedProgressVersion(
      'Progress version ' + p.version + ' requires a compatible Forge version. Progress has NOT been reset.',
    );
  }
  const fail = () => {
    throw new Error('Invalid progress file (expected Forge progress version 1).');
  };
  if (
    !record(p) ||
    p.version !== 1 ||
    !record(p.items) ||
    !record(p.lessons) ||
    !record(p.workspaces) ||
    !record(p.settings)
  )
    fail();
  if (typeof p.settings.unlockAll !== 'boolean') fail();
  for (const i of Object.values(p.items) as any[]) {
    if (
      !record(i) ||
      !['started', 'passed'].includes(i.status) ||
      !count(i.attempts) ||
      !count(i.hintsShown) ||
      typeof i.solutionRevealed !== 'boolean'
    )
      fail();
    if (i.files !== undefined && !files(i.files)) fail();
    if (i.passedAt !== undefined && !date(i.passedAt)) fail();
    if (
      i.lastResult !== undefined &&
      (!record(i.lastResult) || !count(i.lastResult.passed) || !count(i.lastResult.total) || !date(i.lastResult.at))
    )
      fail();
  }
  for (const l of Object.values(p.lessons) as any[]) if (!record(l) || !date(l.doneAt)) fail();
  for (const w of Object.values(p.workspaces) as any[])
    if (!record(w) || !files(w.files) || typeof w.updatedAt !== 'string') fail();
  if (p.lastVisited !== undefined && typeof p.lastVisited !== 'string') fail();
  if (p.review === undefined) p.review = { entries: {} };
  if (!record(p.review) || !record(p.review.entries)) fail();
  for (const e of Object.values(p.review.entries) as any[])
    if (!record(e) || !count(e.stage) || !date(e.due) || !date(e.at)) fail();
  if (p.review.attempts !== undefined) {
    if (!record(p.review.attempts)) fail();
    for (const a of Object.values(p.review.attempts) as any[]) {
      if (
        !record(a) ||
        !date(a.cycle) ||
        !files(a.files) ||
        !count(a.attempts) ||
        !count(a.hintsShown) ||
        typeof a.solutionRevealed !== 'boolean' ||
        !['started', 'passed'].includes(a.status)
      )
        fail();
      if (a.reviewOutcome !== undefined && !['right', 'wrong'].includes(a.reviewOutcome)) fail();
    }
  }
  if (p.review.restedOn !== undefined && typeof p.review.restedOn !== 'string') fail();
  return p as Progress;
}

/** A store owns one directory. Tests instantiate it with temporary directories, never learner data. */
export function createProgressStore(directory: string) {
  const file = join(directory, 'progress.json');
  const backup = (n: number) => file + '.backup-' + n;
  let cache: Progress | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let recovery: string | null = null;
  const write = (text: string) => {
    mkdirSync(directory, { recursive: true });
    const tmp = file + '.tmp';
    writeFileSync(tmp, text);
    const fd = openSync(tmp, 'r+');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, file);
  };
  function get(): Progress {
    if (cache) return cache;
    let damaged: unknown;
    if (existsSync(file)) {
      try {
        return (cache = parseProgress(readFileSync(file, 'utf8')));
      } catch (error) {
        if (error instanceof UnsupportedProgressVersion) throw error;
        damaged = error;
      }
    }
    const candidates = [...[1, 2, 3, 4, 5].map(backup), file + '.tmp'];
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      let restored: Progress;
      try {
        restored = parseProgress(readFileSync(candidate, 'utf8'));
      } catch {
        continue;
      }
      // Preserve the exact damaged bytes before restoring. Never silently discard learner work.
      const preserved = file + '.corrupt-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID();
      if (existsSync(file)) copyFileSync(file, preserved);
      write(JSON.stringify(restored, null, 1));
      recovery =
        'Recovered progress from ' +
        candidate +
        (damaged ? '. Damaged file preserved at ' + preserved : '. The primary file was missing.');
      console.warn('[progress] ' + recovery);
      return (cache = restored);
    }
    if (damaged || candidates.some((candidate) => existsSync(candidate))) {
      throw new Error(
        'Could not read ' +
          file +
          ' and no valid backup was found. Progress has NOT been reset. Preserve this directory and restore a valid progress.json before restarting.',
      );
    }
    return (cache = emptyProgress());
  }
  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!cache) return;
    // Validate before touching the primary or backups; a failed load never installs a writable cache.
    const text = JSON.stringify(cache, null, 1);
    parseProgress(text);
    if (existsSync(file)) {
      const previous = readFileSync(file, 'utf8');
      parseProgress(previous);
      if (previous === text) return;
      for (let n = 4; n >= 1; n--) if (existsSync(backup(n))) copyFileSync(backup(n), backup(n + 1));
      copyFileSync(file, backup(1));
    }
    write(text);
  }
  return {
    get,
    flush,
    save() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 150);
    },
    get recovery() {
      return recovery;
    },
  };
}
