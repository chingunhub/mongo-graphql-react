import { expect } from 'expect';
import { resetDb } from '@forge/kit';
import { Ticket } from '../services/tickets/model';
import { Activity, processOpening } from '../services/activity/worker';
import { ingest } from '../services/tickets/intake';
import { buildContext } from '../packages/contracts/context';
import { dispatchPending, operationReport } from '../services/operations';
const ctx = (tenant = 'n', role = 'agent') =>
  buildContext({ id: 'a', memberships: { [tenant]: role } as any }, tenant, 'request-1');
const seed = (sourceId: string, tenant = 'n') => ingest(ctx(tenant), { sourceId, subject: 'Help', contactId: 'c1' });
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
beforeAll(async () => {
  await Promise.all([Ticket.init(), Activity.init()]);
});
beforeEach(resetDb);
test('delivery creates a receipt before acknowledgement', async () => {
  await seed('1');
  expect(await operationReport(ctx())).toEqual({
    tickets: 1,
    pending: 1,
    activities: 0,
  });
  expect(await dispatchPending(ctx(), processOpening)).toEqual({
    delivered: 1,
    failed: 0,
  });
  expect(await operationReport(ctx())).toEqual({
    tickets: 1,
    pending: 0,
    activities: 1,
  });
  expect(await dispatchPending(ctx(), processOpening)).toEqual({
    delivered: 0,
    failed: 0,
  });
});
test('one failed event stays pending while another succeeds', async () => {
  const first = await seed('1');
  await seed('2');
  const seen: any[] = [];
  const report = await dispatchPending(ctx(), async (event) => {
    seen.push(event);
    if (event.ticketId === String(first._id)) throw Error('offline');
    return processOpening(event);
  });
  expect(report).toEqual({ delivered: 1, failed: 1 });
  expect(await operationReport(ctx())).toEqual({
    tickets: 2,
    pending: 1,
    activities: 1,
  });
  expect(seen[0]).toMatchObject({ version: 1, requestId: 'request-1' });
  expect(seen[0].delivered).toBeUndefined();
  expect(await dispatchPending(ctx(), processOpening)).toEqual({
    delivered: 1,
    failed: 0,
  });
});
test('tenant filters apply to dispatch and every count', async () => {
  await seed('1', 'n');
  await seed('1', 's');
  await dispatchPending(ctx('n'), processOpening);
  expect(await operationReport(ctx('s'))).toEqual({
    tickets: 1,
    pending: 1,
    activities: 0,
  });
});
test('effect survives acknowledgement failure without duplication on retry', async () => {
  await seed('1');
  // Only the Ticket writes fail: the delivery lands, then the acknowledgement cannot.
  const offline = async () => {
    throw Error('ack offline');
  };
  expect(await duringWrites(Ticket, offline, () => dispatchPending(ctx(), processOpening))).toEqual({
    delivered: 0,
    failed: 1,
  });
  expect(await operationReport(ctx())).toEqual({
    tickets: 1,
    pending: 1,
    activities: 1,
  });
  expect(await dispatchPending(ctx(), processOpening)).toEqual({
    delivered: 1,
    failed: 0,
  });
  expect(await Activity.countDocuments()).toBe(1);
});
test('an acknowledgement that matches nothing is not a delivery', async () => {
  await seed('1');
  const report = await dispatchPending(ctx(), async (event) => {
    await processOpening(event);
    await Ticket.deleteOne({ _id: event.ticketId });
  });
  expect(report).toEqual({ delivered: 0, failed: 1 });
});
test('dispatch only ever sees its own tenant', async () => {
  await seed('1', 'n');
  await seed('1', 's');
  const seen: string[] = [];
  const report = await dispatchPending(ctx('n'), async (event) => {
    seen.push(event.tenant);
  });
  expect(seen).toEqual(['n']);
  expect(report).toEqual({ delivered: 1, failed: 0 });
});
test('malformed event identity cannot cross tenant boundary', async () => {
  const ticket = await seed('1');
  await Ticket.updateOne({ _id: ticket._id }, { $set: { 'event.tenant': 's' } });
  let called = false;
  expect(
    await dispatchPending(ctx(), async () => {
      called = true;
    }),
  ).toEqual({ delivered: 0, failed: 1 });
  expect(called).toBe(false);
});
test('a role with no read permission gets no report', async () => {
  await expect(operationReport({ ...ctx(), role: 'invalid' as any })).rejects.toThrow('FORBIDDEN');
});
test('reader may inspect but not dispatch', async () => {
  await seed('1');
  await expect(dispatchPending(ctx('n', 'reader'), processOpening)).rejects.toThrow('FORBIDDEN');
  expect(await operationReport(ctx('n', 'reader'))).toEqual({
    tickets: 1,
    pending: 1,
    activities: 0,
  });
});
