import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Curriculum, Item } from './content.js';
import { ROOT } from './paths.js';
import type { Progress } from './progress.js';

function appVersion(root: string) {
  const file = join(root, 'installed.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version : null;
}

/**
 * The file a student can choose to send. Every field is picked by name, so saved code can't reach it,
 * and neither can anything added to progress later.
 */
export function exportProgress(course: Curriculum, p: Progress, root = ROOT, now = new Date()) {
  const items = course.modules.flatMap((mod) => mod.items);
  const isDone = (item: Item) =>
    item.kind === 'lesson' ? !!p.lessons[item.key] : p.items[item.key]?.status === 'passed';

  // An item skipped early on, or added to the course later, shouldn't read as the place they stopped.
  const reached = items.findLastIndex(isDone);

  const row = (item: Item) => {
    if (item.kind === 'lesson') {
      const lesson = p.lessons[item.key];
      return lesson ? { key: item.key, kind: item.kind, doneAt: lesson.doneAt } : null;
    }
    const task = p.items[item.key];
    if (!task) return null;
    const last = task.lastResult;
    return {
      key: item.key,
      kind: item.kind,
      status: task.status,
      attempts: task.attempts,
      hintsShown: task.hintsShown,
      solutionRevealed: task.solutionRevealed,
      passedAt: task.passedAt,
      lastResult: last && { passed: last.passed, total: last.total, at: last.at },
    };
  };
  const rows = items.map(row).filter((entry) => entry !== null);

  const dates = [
    ...rows.flatMap((row) => ('doneAt' in row ? row.doneAt : (row.lastResult?.at ?? []))),
    ...Object.values(p.workspaces).map((workspace) => workspace.updatedAt),
  ];

  return {
    format: 'forge-academy-progress',
    version: 1,
    exportedAt: now.toISOString(),
    app: appVersion(root),
    platform: process.platform,
    language: p.settings.language ?? 'en',
    summary: {
      done: items.filter(isDone).length,
      total: items.length,
      stages: [...new Set(course.modules.map((mod) => mod.stage))].map((stage) => {
        const own = course.modules.filter((mod) => mod.stage === stage).flatMap((mod) => mod.items);
        return { stage, done: own.filter(isDone).length, total: own.length };
      }),
      furthest: items[reached]?.key ?? null,
      next: items.slice(reached + 1).find((item) => !isDone(item))?.key ?? null,
      lastActive: dates.sort().at(-1) ?? null,
      solutionsRevealed: rows.filter((row) => 'solutionRevealed' in row && row.solutionRevealed).length,
      reviewCards: Object.keys(p.review.entries).length,
    },
    items: rows,
  };
}
