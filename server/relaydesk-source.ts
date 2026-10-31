import type { Curriculum } from './content.js';
import type { Progress } from './progress.js';
import { workspaceFiles, workspaceStatus } from './workspaces.js';
import { relaydeskScaffold } from './relaydesk-export.js';
import { relaydeskPieces } from '../shared/relaydesk.js';

export function relaydeskSource(cur: Curriculum, progress: Progress, mode: 'mine' | 'reference') {
  const files = {
    ...workspaceFiles(cur, progress, 'relaydesk', mode),
    ...relaydeskScaffold(mode, mode === 'reference' || workspaceStatus(cur, progress, 'relaydesk').complete),
  };
  const steps = cur.workspaces.get('relaydesk') ?? [];
  const provided = new Set(steps.flatMap((step) => step.readonly));
  const owners = new Map<string, string>();
  for (const step of steps)
    for (const path of Object.keys({ ...step.starter, ...step.solution })) owners.set(path, step.key);
  const saved = progress.workspaces.relaydesk?.files ?? {};
  const entries = Object.keys(files)
    .sort()
    .map((path) => {
      const piece = relaydeskPieces.find((piece) => piece.file === path);
      return {
        path,
        bytes: Buffer.byteLength(files[path]),
        step: owners.get(path) ?? piece?.step,
        role: provided.has(path) ? 'provided' : owners.has(path) ? 'build' : 'tooling',
        origin:
          mode === 'reference'
            ? 'reference'
            : provided.has(path)
              ? 'provided'
              : Object.hasOwn(saved, path)
                ? 'saved'
                : owners.has(path)
                  ? 'starter'
                  : 'generated',
        purpose:
          piece?.why ??
          (provided.has(path)
            ? 'Provided integration code. Inspect it here; export the project to modify every file.'
            : owners.has(path)
              ? 'A file in the cumulative project. Its checkpoint owns implementation and grading.'
              : 'Workspace configuration generated for the standalone export.'),
      };
    });
  return { files, entries };
}
