import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSPACE_GRAPH,
  cacheTrace,
  deliveryTrace,
  dualWriteTrace,
  loaderTrace,
  optimisticTrace,
  reach,
  retryRun,
} from '../web/src/viz/systemModels';
test('request-local cache respects both tenant orders', () => {
  for (const first of ['north', 'south'] as const) {
    const frames = cacheTrace('request', first);
    assert.equal(frames.at(-1)!.leaked, false);
    assert.equal(frames.at(-1)!.reads, 2);
    assert.match(frames.at(-1)!.returned, first === 'north' ? /South/ : /North/);
  }
});
test('shared cache leaks without another database read', () => {
  const final = cacheTrace('shared', 'north').at(-1)!;
  assert.equal(final.leaked, true);
  assert.equal(final.reads, 1);
  assert.equal(final.returned, 'North booking');
});
test('durable receipt gives one effect at every crash point', () => {
  for (const point of ['before-effect', 'after-effect', 'after-ack'] as const) {
    const frames = deliveryTrace(point, true);
    assert.equal(frames.at(-1)!.effects, 1);
    assert.equal(frames.at(-1)!.pending, false);
    assert.equal(frames.at(-1)!.receipt, true);
  }
});
test('naive counter duplicates only across the unacknowledged committed effect', () => {
  assert.equal(deliveryTrace('after-effect', false).at(-1)!.effects, 2);
  assert.equal(deliveryTrace('before-effect', false).at(-1)!.effects, 1);
  assert.equal(deliveryTrace('after-ack', false).at(-1)!.effects, 1);
});
test('crash snapshot exposes uncertainty without changing stored state', () => {
  const frames = deliveryTrace('after-effect', true);
  const stopped = frames.find((x) => x.title === 'Process stops')!;
  assert.equal(stopped.pending, true);
  assert.equal(stopped.effects, 1);
  assert.equal(frames.at(-1)!.attempts, 2);
});
test('a change travels to consumers, a build travels to dependencies', () => {
  assert.deepEqual(reach(WORKSPACE_GRAPH, 'contracts', 'dependencies'), ['contracts']);
  assert.deepEqual(reach(WORKSPACE_GRAPH, 'reservations', 'consumers'), ['reservation-screen', 'reservations']);
  assert.deepEqual(reach(WORKSPACE_GRAPH, 'reservation-screen', 'consumers'), ['reservation-screen']);
  assert.deepEqual(reach(WORKSPACE_GRAPH, 'reservation-screen', 'dependencies'), [
    'reservation-screen',
    'reservations',
    'contracts',
    'ui-kit',
  ]);
  assert.equal(reach(WORKSPACE_GRAPH, 'contracts', 'consumers').length, 5);
});
test('a crash between two effects loses the message or invents one', () => {
  const save = dualWriteTrace('save-first', 'between').at(-1)!;
  assert.deepEqual([save.saved, save.sent, save.verdict], [true, false, 'lost']);
  const publish = dualWriteTrace('publish-first', 'between').at(-1)!;
  assert.deepEqual([publish.saved, publish.sent, publish.verdict], [false, true, 'ghost']);
});
test('stored intent reaches the same end whether or not the process dies', () => {
  for (const crash of ['between', 'none'] as const) {
    const end = dualWriteTrace('stored-intent', crash).at(-1)!;
    assert.deepEqual([end.saved, end.sent, end.owed, end.verdict], [true, true, false, 'ok']);
  }
  const dead = dualWriteTrace('stored-intent', 'between').find((x) => x.title === 'Process dies')!;
  assert.deepEqual([dead.saved, dead.owed, dead.sent], [true, true, false]);
});
test('every order is consistent when nothing crashes', () => {
  for (const strategy of ['save-first', 'publish-first', 'stored-intent'] as const)
    assert.equal(dualWriteTrace(strategy, 'none').at(-1)!.verdict, 'ok');
});
test('the retry budget includes the first attempt and doubles the wait', () => {
  const run = retryRun(4, 'exponential', 250, 9);
  assert.equal(run.state, 'failed');
  assert.deepEqual(
    run.attempts.map((a) => a.at),
    [0, 250, 750, 1750],
  );
  assert.deepEqual(
    retryRun(4, 'fixed', 250, 9).attempts.map((a) => a.at),
    [0, 250, 500, 750],
  );
});
test('a job stops retrying as soon as an attempt succeeds', () => {
  const run = retryRun(4, 'exponential', 250, 2);
  assert.equal(run.state, 'completed');
  assert.equal(run.attempts.length, 3);
  assert.equal(run.totalMs, 750);
  assert.equal(retryRun(1, 'exponential', 250, 1).state, 'failed');
});

test('a plain resolver pays per issue and DataLoader pays once', () => {
  for (const issues of [5, 20, 50])
    for (const people of [3, issues]) {
      const plain = loaderTrace('plain', issues, people);
      const loader = loaderTrace('loader', issues, people);
      assert.equal(plain.at(-1)?.queries, issues + 1);
      assert.equal(loader.at(-1)?.queries, 2);
      for (const frames of [plain, loader]) {
        assert.equal(frames.at(-1)?.resolved, issues);
        assert.deepEqual(
          frames.map((f) => f.final),
          frames.map((_, i) => i === frames.length - 1),
        );
        for (let i = 1; i < frames.length; i++) assert.ok(frames[i].queries >= frames[i - 1].queries);
      }
      assert.ok(loader.every((f) => f.queued === 0 || f.queued === people));
      assert.ok(loader.every((f) => f.queries <= 2));
    }
  assert.match(loaderTrace('plain', 20, 3).at(-1)!.detail, /17 of them/);
  assert.doesNotMatch(loaderTrace('plain', 20, 20).at(-1)!.detail, /already fetched/);
});

test('an optimistic guess shows at once and never reaches the stored cache', () => {
  for (const outcome of ['success', 'failure'] as const) {
    const frames = optimisticTrace(true, outcome);
    assert.equal(frames[1].card, 'DONE');
    for (const frame of frames.slice(0, -1)) assert.equal(frame.cache, 'TODO');
    assert.equal(frames.at(-1)?.layer, 'empty');
  }
  const refused = optimisticTrace(true, 'failure').at(-1)!;
  assert.deepEqual([refused.card, refused.cache, refused.rolledBack], ['TODO', 'TODO', true]);
  const accepted = optimisticTrace(true, 'success').at(-1)!;
  assert.deepEqual([accepted.card, accepted.cache, accepted.rolledBack], ['DONE', 'DONE', false]);
});

test('waiting for the server shows nothing early and has nothing to roll back', () => {
  for (const outcome of ['success', 'failure'] as const) {
    const frames = optimisticTrace(false, outcome);
    for (const frame of frames.slice(0, -1)) assert.equal(frame.card, 'TODO');
    assert.ok(frames.every((f) => f.layer === 'empty' && !f.rolledBack));
    assert.equal(frames.at(-1)?.card, outcome === 'success' ? 'DONE' : 'TODO');
  }
});
