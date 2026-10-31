import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCurriculum } from '../server/content';
import { workspaceFiles, workspaceStatus } from '../server/workspaces';
import type { Progress } from '../server/progress';
import {
  IS_WORKTREE,
  SANDBOX_PREFIX,
  PORT,
  REFERENCE_PORT,
  LAUNCH_PORT,
  databaseName,
} from '../server/paths';
const progress = (): Progress => ({
  version: 1,
  items: {
    'm04/f4-comments': {
      status: 'passed',
      attempts: 2,
      hintsShown: 1,
      solutionRevealed: false,
    },
  },
  lessons: { 'm04/l1-embed-or-reference': { doneAt: '2026-10-25' } },
  workspaces: {
    taskforge: {
      files: { 'server/models/Comment.ts': 'student-owned' },
      updatedAt: 'before',
    },
  },
  settings: { unlockAll: false },
  lastVisited: 'm04/f4-comments',
});
test('legacy progress and Taskforge files survive new workspace reads unchanged', () => {
  const p = progress(),
    before = JSON.stringify(p);
  workspaceFiles(loadCurriculum(), p, 'relaydesk', 'mine');
  workspaceStatus(loadCurriculum(), p, 'relaydesk');
  assert.equal(JSON.stringify(p), before);
});
test('learner export includes TODOs and saved code, never fills with reference answers', () => {
  const c = loadCurriculum(),
    p = progress();
  p.workspaces.relaydesk = {
    files: {
      'services/lifecycle.ts': 'my unfinished implementation',
      'services/my-helper.ts': 'my additional saved helper',
      'runtime/auth.ts': 'tampered helper',
    },
    updatedAt: 'now',
  };
  const mine = workspaceFiles(c, p, 'relaydesk', 'mine');
  assert.equal(mine['services/lifecycle.ts'], 'my unfinished implementation');
  assert.equal(mine['services/my-helper.ts'], 'my additional saved helper');
  assert.match(mine['services/tickets/intake.ts'], /TODO: durable intake/);
  assert.notEqual(mine['runtime/auth.ts'], 'tampered helper');
  assert.equal(p.workspaces.taskforge.files['server/models/Comment.ts'], 'student-owned');
});
test('reference export is explicit and does not mutate progress', () => {
  const c = loadCurriculum(),
    p = progress(),
    before = JSON.stringify(p);
  const reference = workspaceFiles(c, p, 'relaydesk', 'reference');
  assert.match(reference['services/lifecycle.ts'], /await deps.connect/);
  assert.equal(JSON.stringify(p), before);
  assert.equal(workspaceStatus(c, p, 'relaydesk').complete, false);
});
test('worktree runtime cannot match the original broad sandbox cleanup', () => {
  if (!IS_WORKTREE) return;
  assert.equal(SANDBOX_PREFIX.startsWith('sandbox_'), false);
  assert.notEqual(databaseName('forge_reference'), 'forge_reference');
  assert.deepEqual([PORT, REFERENCE_PORT, LAUNCH_PORT], [4510, 4610, 4710]);
});
test('old and new project steps remain separate and ordered', () => {
  const c = loadCurriculum();
  assert.equal(c.modules.length, 25);
  assert.equal(c.workspaces.get('relaydesk')?.length, 13);
  assert.ok(c.workspaces.get('taskforge')!.every((step) => Number(step.moduleId.slice(1)) <= 13));
  assert.ok(c.workspaces.get('relaydesk')!.every((step) => Number(step.moduleId.slice(1)) >= 14));
});
