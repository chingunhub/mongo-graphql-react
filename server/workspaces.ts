import { cumulative, isTaskLocal, type Curriculum } from './content.js';
import type { Progress } from './progress.js';
import type { Files } from './runner.js';
import { RELAYDESK_BOOT } from '../shared/relaydesk.js';

/** Export learner work without silently borrowing reference implementations. */
export function workspaceFiles(
  cur: Curriculum,
  progress: Progress,
  workspace: string,
  mode: 'mine' | 'reference',
  until?: number,
): Files {
  const allSteps = cur.workspaces.get(workspace);
  const steps = allSteps?.slice(0, until ?? allSteps.length);
  if (!steps) throw Error('Unknown workspace: ' + workspace);
  if (mode === 'reference') return cumulative(cur, workspace, steps.length);
  const files: Files = {};
  const readonly = new Set(steps.flatMap((step) => step.readonly));
  // Include all future TODO contracts, but never any solution directory.
  for (const step of steps)
    for (const [path, source] of Object.entries(step.starter)) if (!isTaskLocal(path)) files[path] = source;
  for (const [path, source] of Object.entries(progress.workspaces[workspace]?.files ?? {})) {
    if (!isTaskLocal(path) && !readonly.has(path)) files[path] = source;
  }
  return files;
}
export function workspaceStatus(cur: Curriculum, progress: Progress, workspace: string) {
  const steps = cur.workspaces.get(workspace) ?? [];
  const passed = steps.filter((step) => progress.items[step.key]?.status === 'passed').length;
  return {
    passed,
    total: steps.length,
    complete: steps.length > 0 && passed === steps.length,
  };
}

/** Keep the original boot milestone runnable while later ownership steps are unfinished. */
export function relaydeskLaunch(cur: Curriculum, progress: Progress) {
  const steps = cur.workspaces.get('relaydesk') ?? [];
  const minimum = steps.findIndex((step) => step.key === RELAYDESK_BOOT) + 1;
  let count = 0;
  while (count < steps.length && progress.items[steps[count].key]?.status === 'passed') count++;
  const ready = minimum > 0 && count >= minimum;
  return {
    ready,
    count,
    step: ready ? steps[count - 1].key : null,
    files: ready ? workspaceFiles(cur, progress, 'relaydesk', 'mine', count) : null,
  };
}
