import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCurriculum } from '../server/content';
import { workspaceFiles, relaydeskLaunch, workspaceStatus } from '../server/workspaces';
import { relaydeskSource } from '../server/relaydesk-source';
import { relaydeskLayers, relaydeskPieces, relaydeskJourney, RELAYDESK_BOOT } from '../shared/relaydesk';
import type { Progress } from '../server/progress';
const blank = (): Progress => ({
  version: 1,
  items: {},
  lessons: {},
  workspaces: {},
  settings: { unlockAll: false },
});
test('every map file and learning link exists in the exported project', () => {
  const cur = loadCurriculum(),
    source = relaydeskSource(cur, blank(), 'reference');
  assert.equal(new Set(relaydeskPieces.map((p) => p.id)).size, relaydeskPieces.length);
  for (const layer of relaydeskLayers)
    for (const piece of layer.pieces) {
      assert.ok(Object.hasOwn(source.files, piece.file), piece.file);
      if (piece.step) assert.equal(cur.byKey.get(piece.step)?.kind, 'forge', piece.step);
      if (piece.lesson) assert.equal(cur.byKey.get(piece.lesson)?.kind, 'lesson', piece.lesson);
    }
  assert.ok(Object.hasOwn(source.files, 'pnpm-lock.yaml'));
  assert.ok(Object.hasOwn(source.files, 'web/generated/graphql.ts'));
  assert.ok(Object.hasOwn(source.files, 'runtime/serve.ts'));
  assert.deepEqual(
    source.entries.map((e) => e.path),
    Object.keys(source.files).sort(),
  );
});
test('source browsing is a non-mutating assembly and labels actual learner work', () => {
  const cur = loadCurriculum(),
    p = blank();
  p.workspaces.relaydesk = {
    files: {
      'web/session.ts': '// my unfinished implementation',
      'services/helper.ts': '// my helper',
    },
    updatedAt: 'before',
  };
  const before = JSON.stringify(p),
    mine = relaydeskSource(cur, p, 'mine');
  assert.equal(mine.files['web/session.ts'], '// my unfinished implementation');
  assert.equal(mine.entries.find((e) => e.path === 'web/session.ts')?.origin, 'saved');
  assert.match(mine.files['web/SupportInbox.tsx'], /TODO/);
  assert.notEqual(relaydeskSource(cur, p, 'reference').files['web/session.ts'], mine.files['web/session.ts']);
  assert.equal(JSON.stringify(p), before);
});
test('foundation launch stays available before ownership steps; each passed stage activates its wrapper', () => {
  const cur = loadCurriculum(),
    p = blank(),
    steps = cur.workspaces.get('relaydesk')!;
  const boot = steps.findIndex((s) => s.key === RELAYDESK_BOOT);
  for (const step of steps.slice(0, boot + 1))
    p.items[step.key] = {
      status: 'passed',
      attempts: 1,
      hintsShown: 0,
      solutionRevealed: false,
    };
  assert.equal(workspaceStatus(cur, p, 'relaydesk').complete, false);
  const foundation = relaydeskLaunch(cur, p);
  assert.equal(foundation.ready, true);
  assert.equal(foundation.step, RELAYDESK_BOOT);
  assert.doesNotMatch(foundation.files!['runtime/auth.ts'], /resolveHttpContext/);
  assert.doesNotMatch(foundation.files!['web/App.tsx'], /createSession/);
  p.items[steps[boot + 1].key] = {
    status: 'passed',
    attempts: 1,
    hintsShown: 0,
    solutionRevealed: false,
  };
  assert.match(relaydeskLaunch(cur, p).files!['runtime/auth.ts'], /resolveHttpContext/);
  assert.doesNotMatch(relaydeskLaunch(cur, p).files!['runtime/queue.ts'], /openDelivery/);
  p.items[steps[boot + 3].key] = {
    status: 'passed',
    attempts: 1,
    hintsShown: 0,
    solutionRevealed: false,
  };
  assert.equal(relaydeskLaunch(cur, p).count, boot + 2, 'a gap must not activate later wrappers');
});
test('launch never fills a missing implementation with a reference answer', () => {
  const cur = loadCurriculum(),
    p = blank();
  for (const step of cur.workspaces.get('relaydesk')!)
    p.items[step.key] = {
      status: 'passed',
      attempts: 1,
      hintsShown: 0,
      solutionRevealed: false,
    };
  const files = relaydeskLaunch(cur, p).files!;
  assert.match(files['services/http-context.ts'], /TODO/);
  assert.match(files['web/session.ts'], /TODO/);
  assert.deepEqual(files, workspaceFiles(cur, p, 'relaydesk', 'mine'));
});
test('request traces link actual map owners and recovery preserves one durable effect', () => {
  for (const kind of ['query', 'triage', 'delivery', 'recovery'] as const) {
    const frames = relaydeskJourney(kind);
    assert.ok(frames.length >= 4);
    for (const frame of frames) assert.ok(relaydeskPieces.some((piece) => piece.id === frame.at));
  }
  const recovery = relaydeskJourney('recovery'),
    committed = recovery.findIndex((f) => f.activities === 1);
  assert.equal(recovery[committed].intent, 'pending');
  assert.ok(recovery.slice(committed).every((f) => f.activities === 1));
  assert.equal(recovery.at(-1)?.intent, 'acknowledged');
});
