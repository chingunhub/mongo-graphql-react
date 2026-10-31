import { expect } from 'expect';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { resetDb } from '@forge/kit';
import { Activity, processOpening, enqueueOpening } from '../services/activity/worker';
const event = {
  version: 1,
  id: 'e:1',
  tenant: 'north',
  ticketId: 't1',
  type: 'ticket.opened',
  requestId: 'r1',
};
// Fails every write at the driver, so the test does not care which Mongoose method you chose.
const WRITES = ['insertOne', 'insertMany', 'updateOne', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'bulkWrite'];
async function duringWrites(model: any, onWrite: () => Promise<unknown>, run: () => Promise<unknown>) {
  const collection = model.collection;
  for (const name of WRITES) collection[name] = onWrite;
  try {
    return await run();
  } finally {
    for (const name of WRITES) delete collection[name];
  }
}
beforeAll(() => Activity.init());
beforeEach(resetDb);
test('concurrent duplicate deliveries produce one durable receipt', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => processOpening(event)));
  expect(new Set(results.map((x) => x.id)).size).toBe(1);
  expect(results.filter((x) => !x.duplicate)).toHaveLength(1);
  expect(await Activity.countDocuments()).toBe(1);
  expect(await Activity.findOne().lean()).toMatchObject({
    tenant: 'north',
    eventId: 'e:1',
    ticketId: 't1',
    requestId: 'r1',
    kind: 'ticket.opened',
  });
});
test('tenant is part of receipt identity', async () => {
  await processOpening(event);
  await processOpening({ ...event, tenant: 'south' });
  expect(await Activity.countDocuments()).toBe(2);
});
test('unknown version and extra private fields never write', async () => {
  for (const patch of [{ version: 2 }, { tenant: '' }, { type: 'ticket.deleted' }, { token: 'secret' }])
    await expect(processOpening({ ...event, ...patch })).rejects.toThrow();
  expect(await Activity.countDocuments()).toBe(0);
});
test('enqueue contract preserves stable tenant-scoped identity and retry budget', async () => {
  const calls: any[] = [];
  const queue = {
    add: async (...args: any[]) => {
      calls.push(args);
      return 'queued';
    },
  };
  expect(await enqueueOpening(queue as any, event)).toBe('queued');
  await enqueueOpening(queue as any, event);
  await enqueueOpening(queue as any, { ...event, tenant: 'south' });
  expect(calls[0]).toEqual([
    'ticket.opened',
    event,
    {
      jobId: createHash('sha256')
        .update(JSON.stringify(['north', 'e:1']))
        .digest('hex'),
      attempts: 4,
      backoff: { type: 'exponential', delay: 250 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  ]);
  expect(calls[1][2].jobId).toBe(calls[0][2].jobId);
  expect(calls[2][2].jobId).not.toBe(calls[0][2].jobId);
});
test('enqueue refuses malformed messages and propagates transport errors', async () => {
  let called = false;
  const queue = {
    add: async () => {
      called = true;
      throw Error('redis offline');
    },
  };
  await expect(enqueueOpening(queue as any, { ...event, version: 2 })).rejects.toThrow();
  expect(called).toBe(false);
  await expect(enqueueOpening(queue as any, event)).rejects.toThrow('redis offline');
});
test('receipt storage errors remain failures', async () => {
  const offline = async () => {
    throw Error('storage offline');
  };
  await expect(duringWrites(Activity, offline, () => processOpening(event))).rejects.toThrow('storage offline');
});
test('only a duplicate key means someone else recorded it', async () => {
  // A rival receipt lands just as our own write fails for an unrelated reason.
  const receipt = { tenant: 'north', eventId: 'e:1', ticketId: 't1', requestId: 'r1', kind: 'ticket.opened' };
  const fail = async () => {
    await mongoose.connection.db!.collection(Activity.collection.name).insertOne({ ...receipt });
    throw Error('storage offline');
  };
  await expect(duringWrites(Activity, fail, () => processOpening(event))).rejects.toThrow('storage offline');
});
