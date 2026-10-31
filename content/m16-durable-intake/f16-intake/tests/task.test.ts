import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb } from '@forge/kit';
import { Ticket } from '../services/tickets/model';
import { ingest } from '../services/tickets/intake';
import { buildContext } from '../packages/contracts/context';
const ctx = (tenant = 'north', role = 'agent') =>
  buildContext({ id: 'ada', memberships: { [tenant]: role } as any }, tenant, 'request-7');
const input = { sourceId: 'mail-7', subject: ' Help ', contactId: 'c1' };
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
beforeAll(() => Ticket.init());
beforeEach(resetDb);
test('ticket and bounded event appear together', async () => {
  const t = await ingest(ctx(), input);
  expect(t).toMatchObject({
    tenant: 'north',
    sourceId: 'mail-7',
    subject: 'Help',
    contactId: 'c1',
    priority: 'normal',
    version: 0,
    event: {
      id: String(t._id),
      ticketId: String(t._id),
      tenant: 'north',
      type: 'ticket.opened',
      requestId: 'request-7',
      delivered: false,
    },
  });
  expect((t.event as any)._id).toBeUndefined();
});
test(
  'eight simultaneous duplicates converge on one persisted ticket',
  async () => {
    const rows = await Promise.all(Array.from({ length: 8 }, () => ingest(ctx(), input)));
    expect(new Set(rows.map((t) => String(t._id))).size).toBe(1);
    expect(await Ticket.countDocuments()).toBe(1);
  },
  {
    hint: 'The compound unique index and duplicate-key recovery must cooperate.',
  },
);
test('retry never overwrites accepted content or acknowledgement', async () => {
  const first = await ingest(ctx(), input);
  await Ticket.updateOne({ _id: first._id }, { $set: { 'event.delivered': true } });
  const again = await ingest({ ...ctx(), requestId: 'retry' }, { ...input, subject: 'changed' });
  expect(String(again._id)).toBe(String(first._id));
  expect(again.subject).toBe('Help');
  expect(again.event.delivered).toBe(true);
  expect(again.event.requestId).toBe('request-7');
});
test('same external key can belong to different tenants', async () => {
  const a = await ingest(ctx('north'), input),
    b = await ingest(ctx('south'), input);
  expect(String(a._id)).not.toBe(String(b._id));
});
test('unauthorized intake and invalid fields never write', async () => {
  await expect(ingest(ctx('north', 'reader'), input)).rejects.toThrow('FORBIDDEN');
  for (const field of ['sourceId', 'subject', 'contactId'])
    await expect(ingest(ctx(), { ...input, [field]: '  ' })).rejects.toThrow('BAD_INPUT');
  expect(await Ticket.countDocuments()).toBe(0);
});
test('database enforces compound uniqueness', async () => {
  await ingest(ctx(), input);
  const indexes = await Ticket.collection.indexes();
  expect(indexes.some((x: any) => x.unique && x.key.tenant === 1 && x.key.sourceId === 1)).toBe(true);
});
test('Mongoose Schema validates required data and priority', async () => {
  const t = await ingest(ctx(), input);
  const { _id, ...doc } = t;
  await expect(new Ticket({ ...doc, sourceId: 'x', priority: 'urgent' }).validate()).rejects.toThrow();
  await expect(new Ticket({ tenant: 'north' }).validate()).rejects.toThrow();
});
test('the subject is trimmed before it is stored', async () => {
  const t = await ingest(ctx(), { sourceId: 'mail-9', subject: '  Printer  ', contactId: 'c1' });
  expect(t.subject).toBe('Printer');
});
test('unrelated storage failures are not swallowed', async () => {
  const offline = async () => {
    throw Error('storage offline');
  };
  await expect(duringWrites(Ticket, offline, () => ingest(ctx(), input))).rejects.toThrow('storage offline');
});
// The next two stage a race deterministically: a rival's insert lands just as our write fails.
const rivalRow = (subject: string) => {
  const _id = new mongoose.Types.ObjectId();
  const id = String(_id);
  const event = { id, ticketId: id, tenant: 'north', type: 'ticket.opened', requestId: 'rival', delivered: false };
  return { _id, tenant: 'north', sourceId: 'mail-7', subject, contactId: 'c1', priority: 'normal', version: 0, event };
};
const insertRival = (subject: string) =>
  mongoose.connection.db!.collection(Ticket.collection.name).insertOne(rivalRow(subject) as any);
test('losing the race returns the row the winner stored', async () => {
  const lose = async () => {
    await insertRival('Winner');
    throw Object.assign(Error('E11000 duplicate key error'), { code: 11000 });
  };
  const ticket: any = await duringWrites(Ticket, lose, () => ingest(ctx(), input));
  expect(ticket.subject).toBe('Winner');
  expect(ticket.event.requestId).toBe('rival');
});
test('only a duplicate key counts as losing the race', async () => {
  const fail = async () => {
    await insertRival('Winner');
    throw Error('storage offline');
  };
  await expect(duringWrites(Ticket, fail, () => ingest(ctx(), input))).rejects.toThrow('storage offline');
});
