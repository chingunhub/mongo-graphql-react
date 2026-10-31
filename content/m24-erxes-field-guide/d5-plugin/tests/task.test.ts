import { expect } from 'expect';
import mongoose from 'mongoose';
import { initTRPC } from '@trpc/server';
import { createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import { z } from 'zod';
import { sendTRPCMessage, setUserHeader, startPlugin, type User } from '../erxes-api-shared';
import { startTickets } from '../main';

const agent: User = { _id: 'u1', actions: [] };
const manager: User = { _id: 'u2', actions: ['tickets:manage'] };
const owner: User = { _id: 'u3', isOwner: true };

let contactCalls: string[][] = [];
const t = initTRPC.context<{ subdomain: string }>().create();
const contactsRouter = t.router({
  contacts: t.router({
    find: t.procedure.input(z.object({ ids: z.array(z.string()) })).query(({ ctx, input }) => {
      contactCalls.push(input.ids);
      return input.ids.filter((id) => id !== 'ghost').map((_id) => ({ _id, name: `${ctx.subdomain} ${_id}` }));
    }),
  }),
});
const startContacts = () =>
  startPlugin({
    name: 'contacts',
    graphql: async () => ({ typeDefs: 'type Query { ok: Boolean }', resolvers: {} }),
    trpcAppRouter: { router: contactsRouter, createContext: async (_subdomain, context) => context },
  });

const database = (subdomain: string) =>
  mongoose.connection.useDb(`${mongoose.connection.name}_${subdomain}`, { useCache: true });

let contacts: Awaited<ReturnType<typeof startContacts>>;
let tickets: Awaited<ReturnType<typeof startTickets>>;

beforeAll(async () => {
  contacts = await startContacts();
  tickets = await startTickets();
});
afterAll(async () => {
  await tickets?.stop();
  await contacts?.stop();
  for (const subdomain of ['north', 'south']) await database(subdomain).dropDatabase();
});
beforeEach(async () => {
  contactCalls = [];
  for (const subdomain of ['north', 'south']) await database(subdomain).collection('tickets').deleteMany({});
});

async function graph(query: string, variables: any, options: { subdomain?: string; user?: User } = {}) {
  const headers: any = { 'content-type': 'application/json', 'x-subdomain': options.subdomain ?? 'north' };
  if (options.user) setUserHeader(headers, options.user);
  const response = await fetch(`${tickets.url}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as any;
}

const ADD = 'mutation($subject: String!, $contactId: ID) { ticketAdd(subject: $subject, contactId: $contactId) { _id priority } }';
const add = async (subject: string, contactId: string | null = null, subdomain = 'north') => {
  const result = await graph(ADD, { subject, contactId }, { subdomain, user: agent });
  if (result.errors) throw new Error(result.errors[0].message);
  return result.data.ticketAdd;
};
const LIST = 'query($priority: String) { tickets(priority: $priority) { subject priority contact { name } } }';
const RAISE = 'mutation($id: ID!) { ticketRaise(_id: $id) { _id priority } }';
const ENTITIES = 'query($r: [_Any!]!) { _entities(representations: $r) { ... on Ticket { _id subject } } }';

test(
  'every query and mutation refuses a stranger',
  async () => {
    const created = await add('Printer');
    for (const [query, variables] of [
      [LIST, {}],
      ['query($id: ID!) { ticket(_id: $id) { _id } }', { id: created._id }],
      [ADD, { subject: 'Nope' }],
      [RAISE, { id: created._id }],
    ] as const) {
      const result = await graph(query, variables);
      expect(result.errors?.[0]?.message).toBe('Login required');
    }
  },
  { hint: 'moduleRequireLogin covers an object, and it only sees the keys that exist when you call it.' },
);

test(
  'tickets are created and read per subdomain',
  async () => {
    await add('North printer');
    const created = await add('South printer', null, 'south');
    expect(created.priority).toBe('normal');
    const north = await graph(LIST, {}, { user: agent });
    expect(north.data.tickets.map((x: any) => x.subject)).toEqual(['North printer']);
    const crossed = await graph('query($id: ID!) { ticket(_id: $id) { _id } }', { id: created._id }, { user: agent });
    expect(crossed.errors?.[0]?.message).toBe('Ticket not found');
    const own = await graph('query($id: ID!) { ticket(_id: $id) { subject } }', { id: created._id }, { subdomain: 'south', user: agent });
    expect(own.data.ticket.subject).toBe('South printer');
  },
  { hint: 'Your resolvers should only ever use context.models.' },
);

test(
  'tickets can be filtered by priority',
  async () => {
    const urgent = await add('Urgent');
    await add('Routine');
    await graph(RAISE, { id: urgent._id }, { user: owner });
    const high = await graph(LIST, { priority: 'high' }, { user: agent });
    expect(high.data.tickets.map((x: any) => x.subject)).toEqual(['Urgent']);
    const all = await graph(LIST, {}, { user: agent });
    expect(all.data.tickets).toHaveLength(2);
  },
  { hint: 'Leaving out the argument should return every priority.' },
);

test(
  'raising a ticket needs tickets:manage, and stays in its tenant',
  async () => {
    const created = await add('Server down');
    const denied = await graph(RAISE, { id: created._id }, { user: agent });
    expect(denied.errors?.[0]?.message).toBe('Permission required');
    const allowed = await graph(RAISE, { id: created._id }, { user: manager });
    expect(allowed.data.ticketRaise).toEqual({ _id: created._id, priority: 'high' });
    const other = await add('Quiet', null, 'south');
    const crossed = await graph(RAISE, { id: other._id }, { user: manager });
    expect(crossed.errors?.[0]?.message).toBe('Ticket not found');
    const south = await graph(LIST, {}, { subdomain: 'south', user: agent });
    expect(south.data.tickets[0].priority).toBe('normal');
  },
  { hint: 'Apply checkPermission after moduleRequireLogin, or use it alone for that mutation.' },
);

test(
  'contacts come from one message per request, for the right subdomain',
  async () => {
    await add('One', 'c1');
    await add('Two', 'c2');
    await add('Three', 'c1');
    await add('No contact');
    const result = await graph(LIST, {}, { user: agent });
    expect(result.data.tickets.map((x: any) => x.contact?.name ?? null)).toEqual([
      'north c1',
      'north c2',
      'north c1',
      null,
    ]);
    expect(contactCalls).toEqual([['c1', 'c2']]);
    await graph(LIST, {}, { user: agent });
    expect(contactCalls).toHaveLength(2);
    await add('South', 'c1', 'south');
    const south = await graph(LIST, {}, { subdomain: 'south', user: agent });
    expect(south.data.tickets[0].contact.name).toBe('south c1');
  },
  { hint: 'Create the DataLoader per request. A shared one would remember one tenant for another.' },
);

test(
  'a contact that does not exist, or a plugin that is down, costs only that field',
  async () => {
    await add('Lost', 'ghost');
    const missing = await graph(LIST, {}, { user: agent });
    expect(missing.errors).toBeUndefined();
    expect(missing.data.tickets[0].contact).toBe(null);
    await contacts.stop();
    try {
      const down = await graph(LIST, {}, { user: agent });
      expect(down.errors).toBeUndefined();
      expect(down.data.tickets).toEqual([{ subject: 'Lost', priority: 'normal', contact: null }]);
    } finally {
      contacts = await startContacts();
    }
  },
  { hint: 'A DataLoader must return one entry per key, in order, and a missing one is null.' },
);

test(
  'the entity door follows the same rules as the front door',
  async () => {
    const created = await add('Federated');
    const representations = [{ __typename: 'Ticket', _id: created._id }];
    const found = await graph(ENTITIES, { r: representations }, { user: agent });
    expect(found.data._entities).toEqual([{ _id: created._id, subject: 'Federated' }]);
    const stranger = await graph(ENTITIES, { r: representations });
    expect(stranger.errors?.[0]?.message).toBe('Login required');
    const crossed = await graph(ENTITIES, { r: representations }, { subdomain: 'south', user: agent });
    expect(crossed.data._entities).toEqual([null]);
    const sdl = await graph('{ _service { sdl } }', {}, { user: agent });
    expect(sdl.data._service.sdl).toMatch(/type Ticket\s+@key\(fields: "_id"/);
  },
  { hint: 'Module 17: _entities is a second way in, and moduleRequireLogin does not know about it.' },
);

test(
  'other plugins can count tickets over tRPC',
  async () => {
    const urgent = await add('Urgent');
    await add('Routine');
    await graph(RAISE, { id: urgent._id }, { user: owner });
    const count = (input: any, subdomain = 'north') =>
      sendTRPCMessage({ subdomain, pluginName: 'tickets', module: 'tickets', action: 'count', input, defaultValue: 0 });
    expect(await count({})).toBe(2);
    expect(await count({ priority: 'high' })).toBe(1);
    expect(await count({}, 'south')).toBe(0);
    const client = createTRPCUntypedClient({
      links: [httpBatchLink({ url: `${tickets.url}/trpc`, headers: { 'x-subdomain': 'north' } })],
    });
    await expect(client.query('tickets.count', { priority: { $ne: 'x' } })).rejects.toThrow();
  },
  { hint: 'The context needs models too. Validate the input, so that an object can never reach a Mongo filter.' },
);

test(
  'stop closes the plugin and removes it from the registry',
  async () => {
    const own = await startTickets();
    await own.stop();
    await own.stop();
    await expect(fetch(`${own.url}/graphql`, { method: 'POST' })).rejects.toThrow();
    tickets = await startTickets();
  },
  { hint: 'startPlugin gives you stop. Return what it returns.' },
);
