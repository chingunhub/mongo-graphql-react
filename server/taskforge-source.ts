import type { Curriculum } from './content.js';
import type { Progress } from './progress.js';
import type { Files } from './runner.js';
import { isTaskLocal } from './content.js';
import { workspaceFiles } from './workspaces.js';
import { taskforgePieces, taskforgeStages } from '../shared/taskforge.js';

/** Steps passed in an unbroken run from the start. Comparing and running both stop at the first gap. */
export function taskforgePassedRun(cur: Curriculum, progress: Progress) {
  const steps = cur.workspaces.get('taskforge') ?? [];
  let count = 0;
  while (count < steps.length && progress.items[steps[count].key]?.status === 'passed') count++;
  return { steps, count };
}

/** Code from passed tasks that run on the finished project, in course order. */
export function finaleFiles(cur: Curriculum, progress: Progress): Files {
  const { steps, count } = taskforgePassedRun(cur, progress);
  if (!steps.length || count < steps.length) return {};
  const files: Files = {};
  for (const item of cur.byKey.values()) {
    if (item.kind === 'lesson' || item.base !== 'taskforge' || progress.items[item.key]?.status !== 'passed') continue;
    for (const [path, content] of Object.entries(progress.items[item.key].files ?? {}))
      if (!isTaskLocal(path)) files[path] = content;
  }
  return files;
}

export function taskforgeLaunch(cur: Curriculum, progress: Progress) {
  const { steps, count } = taskforgePassedRun(cur, progress);
  const index = (key: string) => steps.findIndex((step) => step.key === key);
  const stage = taskforgeStages.filter((s) => index(s.from) >= 0 && index(s.from) < count).at(-1) ?? null;
  const upcoming = taskforgeStages.find((s) => index(s.from) >= count) ?? null;
  return {
    count,
    total: steps.length,
    stage,
    step: count ? steps[count - 1].key : null,
    next: upcoming && { stage: upcoming, stepsAway: index(upcoming.from) - count + 1 },
  };
}

export function taskforgeSource(cur: Curriculum, progress: Progress, mode: 'mine' | 'reference') {
  const { steps, count } = taskforgePassedRun(cur, progress);
  // The reference is the finished project, like Relaydesk's reference answers.
  const files = workspaceFiles(cur, progress, 'taskforge', mode);
  if (mode === 'mine') Object.assign(files, finaleFiles(cur, progress));
  const provided = new Set(steps.flatMap((step) => step.readonly));
  const owners = new Map<string, string[]>();
  for (const step of steps)
    for (const path of Object.keys({ ...step.starter, ...step.solution }))
      if (!isTaskLocal(path)) owners.set(path, [...(owners.get(path) ?? []), step.key]);
  const saved = progress.workspaces.taskforge?.files ?? {};
  const entries = Object.keys(files)
    .sort()
    .map((path) => {
      const piece = taskforgePieces.find((piece) => piece.file === path);
      const touching = owners.get(path) ?? [];
      return {
        path,
        bytes: Buffer.byteLength(files[path]),
        // A file many steps touch points at the one you would open next.
        step: touching.find((key) => progress.items[key]?.status !== 'passed') ?? touching.at(-1),
        role: provided.has(path) ? 'provided' : 'build',
        origin:
          mode === 'reference'
            ? 'reference'
            : provided.has(path)
              ? 'provided'
              : Object.hasOwn(saved, path)
                ? 'saved'
                : 'starter',
        purpose:
          piece?.why ??
          (provided.has(path)
            ? 'Supplied so the step can stay on its real subject. Read it freely.'
            : 'A file in your Taskforge. The step that owns it is where you edit it.'),
      };
    });
  return { files, entries, passed: count, total: steps.length };
}
