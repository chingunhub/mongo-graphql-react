import { expect } from 'expect';
import { openDelivery } from '../services/queue-delivery';
const event = {
  version: 1,
  id: 'e1',
  tenant: 'north',
  ticketId: 't1',
  type: 'ticket.opened',
  requestId: 'r1',
} as const;
function fixture(fail = '') {
  const calls: string[] = [];
  const failure = new Error('failure at ' + fail);
  const resource = (name: string) => ({
    waitUntilReady: async () => {
      calls.push(name + '.ready');
      if (fail === name + '.ready') throw failure;
    },
    close: async () => {
      calls.push(name + '.close');
      if (fail === name + '.close') throw failure;
    },
  });
  const queue = resource('queue'),
    events = resource('events'),
    worker = resource('worker');
  const connection = {
    ping: async () => {
      calls.push('ping');
      if (fail === 'ping') throw failure;
    },
    disconnect: () => {
      calls.push('disconnect');
    },
  };
  const deps: any = {
    connection: () => {
      calls.push('connection');
      return connection;
    },
    queue: () => {
      calls.push('queue');
      if (fail === 'queue') throw failure;
      return queue;
    },
    events: () => {
      calls.push('events');
      if (fail === 'events') throw failure;
      return events;
    },
    worker: () => {
      calls.push('worker');
      if (fail === 'worker') throw failure;
      return worker;
    },
    enqueue: async (q: any, e: any) => {
      expect(q).toBe(queue);
      expect(e).toBe(event);
      calls.push('enqueue');
      if (fail === 'enqueue') throw failure;
      return {
        waitUntilFinished: async (ev: any, ms: number) => {
          expect(ev).toBe(events);
          expect(ms).toBe(123);
          calls.push('finished');
          if (fail === 'finished') throw failure;
          return { receipt: 'a1' };
        },
      };
    },
    timeoutMs: 123,
  };
  return { calls, failure, deps, queue, events, worker };
}
test('startup constructs in order, waits for readiness, then delivers the worker result', async () => {
  const f = fixture();
  const handle = await openDelivery(f.deps);
  expect(f.calls.slice(0, 5)).toEqual(['connection', 'ping', 'queue', 'events', 'worker']);
  expect(f.calls.filter((c) => c.endsWith('.ready')).sort()).toEqual([
    'events.ready',
    'queue.ready',
    'worker.ready',
  ]);
  expect(handle.mode).toBe('BullMQ / Redis');
  expect(await handle.deliver(event)).toEqual({ receipt: 'a1' });
  await handle.close();
});
test('readiness is awaited rather than merely triggered', async () => {
  const f = fixture();
  let release!: () => void;
  let returned = false;
  f.events.waitUntilReady = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const opening = openDelivery(f.deps).then((x) => {
    returned = true;
    return x;
  });
  for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
  expect(returned).toBe(false);
  release();
  const h = await opening;
  await h.close();
});
test('queue acceptance does not resolve delivery before the worker', async () => {
  const f = fixture();
  let release!: (r: any) => void;
  let resolved = false;
  f.deps.enqueue = async () => ({
    waitUntilFinished: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const h = await openDelivery(f.deps);
  const delivery = h.deliver(event).then((x) => {
    resolved = true;
    return x;
  });
  for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
  expect(resolved).toBe(false);
  release({ done: true });
  expect(await delivery).toEqual({ done: true });
  await h.close();
});
test('both enqueue and worker-result errors propagate', async () => {
  for (const stage of ['enqueue', 'finished']) {
    const f = fixture(stage),
      h = await openDelivery(f.deps);
    await expect(h.deliver(event)).rejects.toBe(f.failure);
    await h.close();
  }
});
test('partial startup closes exactly the resources acquired', async () => {
  for (const stage of ['ping', 'queue', 'events', 'worker', 'events.ready']) {
    const f = fixture(stage);
    await expect(openDelivery(f.deps)).rejects.toBe(f.failure);
    const closed = f.calls.filter((c) => c.endsWith('.close') || c === 'disconnect');
    expect(closed).toEqual(
      stage === 'ping' || stage === 'queue'
        ? ['disconnect']
        : stage === 'events'
          ? ['queue.close', 'disconnect']
          : stage === 'worker'
            ? ['events.close', 'queue.close', 'disconnect']
            : ['worker.close', 'events.close', 'queue.close', 'disconnect'],
    );
  }
});
test('failed startup cleanup cannot mask the original failure', async () => {
  const f = fixture('events.ready');
  f.worker.close = async () => {
    throw Error('cleanup also failed');
  };
  await expect(openDelivery(f.deps)).rejects.toBe(f.failure);
  expect(f.calls).toContain('disconnect');
});
test('concurrent close and failed close are idempotent; future delivery is rejected', async () => {
  const f = fixture('worker.close');
  const h = await openDelivery(f.deps);
  const results = await Promise.allSettled([h.close(), h.close()]);
  expect(results.every((r) => r.status === 'rejected' && r.reason instanceof AggregateError)).toBe(true);
  expect(f.calls.filter((c) => c.endsWith('.close') || c === 'disconnect')).toEqual([
    'worker.close',
    'events.close',
    'queue.close',
    'disconnect',
  ]);
  await expect(h.deliver(event)).rejects.toThrow('CLOSED');
  expect(f.calls).not.toContain('enqueue');
});
