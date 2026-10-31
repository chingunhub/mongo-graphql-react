import { expect } from 'expect';
import mongoose from 'mongoose';
import { databaseName, generateModels } from '../connectionResolvers';

beforeEach(async () => {
  for (const subdomain of ['north', 'south']) {
    const models = await generateModels(subdomain);
    await models.Tickets.deleteMany({});
  }
});

test(
  'subdomains are validated before they can name a database',
  () => {
    expect(databaseName('north')).toBe(`${mongoose.connection.name}_north`);
    for (const bad of ['', 'North', 'a.b', 'x/y', 'a b', '$cmd', 'a'.repeat(21)])
      expect(() => databaseName(bad)).toThrow('Invalid subdomain');
  },
  { hint: 'Check the format with a regular expression before building the name.' },
);

test(
  'each subdomain has its own database',
  async () => {
    const north = await generateModels('north');
    const south = await generateModels('south');
    expect(north.Tickets.db.name).toBe(databaseName('north'));
    expect(south.Tickets.db.name).toBe(databaseName('south'));
    const ticket = await north.Tickets.createTicket({ sourceId: 'mail-1', subject: 'Printer' });
    await expect(south.Tickets.getTicket(String(ticket._id))).rejects.toThrow('Ticket not found');
    expect((await north.Tickets.getTicket(String(ticket._id))).subject).toBe('Printer');
  },
  { hint: 'useDb gives you a connection for another database. Your model must be built on it.' },
);

test(
  'statics use the models they were loaded with, whichever loaded last',
  async () => {
    const north = await generateModels('north');
    const south = await generateModels('south');
    const created = await north.Tickets.createTicket({ sourceId: 'mail-2', subject: 'Screen' });
    await south.Tickets.createTicket({ sourceId: 'mail-2', subject: 'Other' });
    expect((await north.Tickets.closeTicket(String(created._id))).status).toBe('closed');
  },
  { hint: 'Statics should use the models object passed to loadTicketClass.' },
);

test(
  'generateModels can be called on every request',
  async () => {
    const [a, b] = await Promise.all([generateModels('north'), generateModels('north')]);
    expect(a).toBe(b);
    expect(await generateModels('north')).toBe(a);
  },
  { hint: 'Compiling a model name twice on one connection throws OverwriteModelError. Remember what you built.' },
);

test(
  'createTicket returns the existing ticket for a repeated source, even in a race',
  async () => {
    const { Tickets } = await generateModels('north');
    const [a, b] = await Promise.all([
      Tickets.createTicket({ sourceId: 'mail-3', subject: 'One' }),
      Tickets.createTicket({ sourceId: 'mail-3', subject: 'Two' }),
    ]);
    expect(String(a._id)).toBe(String(b._id));
    expect(await Tickets.countDocuments({ sourceId: 'mail-3' })).toBe(1);
    await expect(Tickets.createTicket({ subject: 'No source' } as any)).rejects.toThrow();
  },
  { hint: 'Let the unique index decide, and treat code 11000 as "already there". Do not swallow other errors.' },
);

test(
  'a storage failure is never mistaken for a duplicate',
  async () => {
    const { Tickets } = await generateModels('north');
    const collection = Tickets.collection as any;
    const writes = ['insertOne', 'insertMany', 'updateOne', 'findOneAndUpdate', 'findOneAndReplace', 'bulkWrite'];
    // Another writer gets in first, then this write dies for an unrelated reason.
    const failWrite = async () => {
      for (const name of writes) delete collection[name];
      await collection.insertOne({ sourceId: 'mail-5', subject: 'Someone else', status: 'open' });
      throw new Error('disk full');
    };
    for (const name of writes) collection[name] = failWrite;
    try {
      await expect(Tickets.createTicket({ sourceId: 'mail-5', subject: 'Mine' })).rejects.toThrow('disk full');
    } finally {
      for (const name of writes) delete collection[name];
    }
  },
  { hint: 'Only code 11000 means "already there". Every other error should keep travelling.' },
);

test(
  'the unique index exists by the time generateModels resolves',
  async () => {
    const { Tickets } = await generateModels('east');
    const indexes = await Tickets.collection.indexes();
    expect(indexes.some((index) => index.key.sourceId === 1 && index.unique)).toBe(true);
  },
  { hint: 'Mongoose builds indexes in the background. Which call lets you wait for it?' },
);

test(
  'closeTicket has one winner, and a clear error for everyone else',
  async () => {
    const { Tickets } = await generateModels('north');
    const ticket = await Tickets.createTicket({ sourceId: 'mail-4', subject: 'Race' });
    const results = await Promise.allSettled([
      Tickets.closeTicket(String(ticket._id)),
      Tickets.closeTicket(String(ticket._id)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason.message).toBe('Ticket already closed');
    await expect(Tickets.closeTicket(String(new mongoose.Types.ObjectId()))).rejects.toThrow('Ticket not found');
  },
  { hint: 'The condition on status belongs in the update itself, as you learned with versions.' },
);

afterAll(async () => {
  for (const subdomain of ['north', 'south', 'east']) {
    await mongoose.connection.useDb(`${mongoose.connection.name}_${subdomain}`, { useCache: true }).dropDatabase();
  }
});
