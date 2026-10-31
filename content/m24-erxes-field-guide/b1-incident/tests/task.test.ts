import { expect } from 'expect';
import mongoose from 'mongoose';
import { generateModels } from '../connectionResolvers';
import { closeTicket, createTicket, login, openTicket, ticketSummary } from '../api';

// A fresh pair of companies per test, so nothing carries over in memory.
const used: string[] = [];
let round = 0;
const companies = async () => {
  round += 1;
  const north = `north-${round}`;
  const south = `south-${round}`;
  used.push(north, south);
  await login(north, 'agent');
  await login(south, 'agent');
  return { north, south };
};

afterAll(async () => {
  for (const subdomain of used)
    await mongoose.connection.useDb(`${mongoose.connection.name}_${subdomain}`, { useCache: true }).dropDatabase();
});

// Counts the reads that really reach MongoDB for one company.
async function countReads(subdomain: string) {
  const models = await generateModels(subdomain);
  const collection = models.Tickets.collection as any;
  const reads = { count: 0 };
  for (const method of ['countDocuments', 'aggregate', 'estimatedDocumentCount']) {
    const original = collection[method];
    collection[method] = function (...args: unknown[]) {
      reads.count += 1;
      return original.apply(this, args);
    };
  }
  return reads;
}

test(
  'each company sees its own numbers',
  async () => {
    const { north, south } = await companies();
    await createTicket(north, 'agent', 'One');
    await createTicket(north, 'agent', 'Two');
    const closing = await createTicket(south, 'agent', 'Three');
    await closeTicket(south, 'agent', String(closing._id));
    expect(await ticketSummary(north, 'agent')).toEqual({ open: 2, closed: 0 });
    expect(await ticketSummary(south, 'agent')).toEqual({ open: 0, closed: 1 });
    expect(await ticketSummary(north, 'agent')).toEqual({ open: 2, closed: 0 });
  },
  { hint: 'This is the first support report. What identifies a stored summary?' },
);

test(
  'North can open a ticket while South is signing in',
  async () => {
    const { north, south } = await companies();
    const ticket = await createTicket(north, 'agent', 'Printer');
    const opening = openTicket(north, 'agent', String(ticket._id));
    await login(south, 'agent-2');
    const found = await opening;
    expect(found.subject).toBe('Printer');
  },
  { hint: 'Nothing here is about login. What do two requests in one process share?' },
);

test(
  'South can close a ticket while North is signing in',
  async () => {
    const { north, south } = await companies();
    const ticket = await createTicket(south, 'agent', 'Printer');
    const closing = closeTicket(south, 'agent', String(ticket._id));
    await login(north, 'agent-2');
    const closed = await closing;
    expect(closed.status).toBe('closed');
  },
  { hint: 'Every static on the model has the same exposure.' },
);

test(
  'two companies asking at the same moment each get their own numbers',
  async () => {
    const { north, south } = await companies();
    await createTicket(north, 'agent', 'One');
    await createTicket(north, 'agent', 'Two');
    await createTicket(south, 'agent', 'Three');
    const [first, second] = await Promise.all([ticketSummary(north, 'agent'), ticketSummary(south, 'agent')]);
    expect(first).toEqual({ open: 2, closed: 0 });
    expect(second).toEqual({ open: 1, closed: 0 });
  },
  { hint: 'A correct cache key is not enough if the loader behind it can read another company.' },
);

test(
  'someone with no session in that company is still refused',
  async () => {
    const { north, south } = await companies();
    const ticket = await createTicket(north, 'agent', 'Private');
    await login(south, 'visitor');
    await expect(openTicket(north, 'visitor', String(ticket._id))).rejects.toThrow('Login required');
    await expect(ticketSummary(north, 'visitor')).rejects.toThrow('Login required');
  },
  { hint: 'The session check is not the bug. Keep it.' },
);

test(
  'the summary is still served from memory',
  async () => {
    const { north } = await companies();
    await createTicket(north, 'agent', 'One');
    const reads = await countReads(north);
    await ticketSummary(north, 'agent');
    const afterFirst = reads.count;
    expect(afterFirst).toBeGreaterThan(0);
    await ticketSummary(north, 'agent');
    await ticketSummary(north, 'agent');
    expect(reads.count).toBe(afterFirst);
  },
  { hint: 'Deleting the memo would make the numbers right and the dashboard slow. Keep it.' },
);

test(
  'a summary read during a close does not stick',
  async () => {
    const { north } = await companies();
    const ticket = await createTicket(north, 'agent', 'One');
    const models = await generateModels(north);
    const collection = models.Tickets.collection as any;
    const writes = ['findOneAndUpdate', 'updateOne'];
    // Someone opens the dashboard just before the close reaches the database.
    const readFirst = (name: string) =>
      async function (this: unknown, ...args: unknown[]) {
        const original = Object.getPrototypeOf(collection)[name];
        for (const method of writes) delete collection[method];
        await ticketSummary(north, 'agent');
        return original.apply(this, args);
      };
    for (const name of writes) collection[name] = readFirst(name);
    await closeTicket(north, 'agent', String(ticket._id));
    for (const name of writes) delete collection[name];
    expect(await ticketSummary(north, 'agent')).toEqual({ open: 0, closed: 1 });
  },
  { hint: 'Which has to happen first: changing the data, or forgetting the old answer?' },
);

test(
  'a change refreshes that company, and nobody else',
  async () => {
    const { north, south } = await companies();
    const ticket = await createTicket(north, 'agent', 'One');
    await createTicket(south, 'agent', 'Two');
    expect(await ticketSummary(north, 'agent')).toEqual({ open: 1, closed: 0 });
    expect(await ticketSummary(south, 'agent')).toEqual({ open: 1, closed: 0 });

    const reads = await countReads(south);
    await closeTicket(north, 'agent', String(ticket._id));
    expect(await ticketSummary(north, 'agent')).toEqual({ open: 0, closed: 1 });
    await createTicket(north, 'agent', 'Three');
    expect(await ticketSummary(north, 'agent')).toEqual({ open: 1, closed: 1 });

    expect(await ticketSummary(south, 'agent')).toEqual({ open: 1, closed: 0 });
    expect(reads.count).toBe(0);
  },
  { hint: 'Whatever you changed about the memo key, check who clears it.' },
);
