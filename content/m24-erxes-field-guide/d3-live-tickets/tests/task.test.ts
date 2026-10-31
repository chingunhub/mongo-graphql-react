import { expect } from 'expect';
import { parse, subscribe } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { PubSub } from 'graphql-subscriptions';
import { typeDefs } from '../schema';
import { generateResolvers, publishTicketChanged } from '../subscriptions';

const LIST = parse('subscription($priority: String) { ticketListChanged(priority: $priority) { _id priority } }');
const DETAIL = parse('subscription($id: ID!) { ticketChanged(_id: $id) { _id subject } }');
const user = { _id: 'u1' };

function setup() {
  const pubsub = new PubSub();
  const schema = makeExecutableSchema({ typeDefs, resolvers: { Subscription: generateResolvers(pubsub) as any } });
  return { pubsub, schema };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

async function listen(schema: any, document: any, contextValue: any, variableValues: any = {}) {
  const iterator: any = await subscribe({ schema, document, contextValue, variableValues });
  if (!iterator[Symbol.asyncIterator]) return { errors: iterator.errors };
  const next = iterator.next();
  await tick();
  return {
    iterator,
    next,
    outcome: () => Promise.race([next, new Promise((resolve) => setTimeout(() => resolve('nothing'), 40))]),
  };
}

const ticket = (overrides: any = {}) => ({ _id: 't1', subject: 'Printer', priority: 'high', ...overrides });

test(
  'a list subscriber receives changes for its own subdomain',
  async () => {
    const { pubsub, schema } = setup();
    const live: any = await listen(schema, LIST, { subdomain: 'north', user });
    await publishTicketChanged(pubsub, 'north', ticket());
    expect((await live.next).value.data).toEqual({ ticketListChanged: { _id: 't1', priority: 'high' } });
    await live.iterator.return();
  },
  { hint: 'GraphQL reads the value from the payload key matching the field name.' },
);

test(
  'another subdomain never sees it',
  async () => {
    const { pubsub, schema } = setup();
    const live: any = await listen(schema, LIST, { subdomain: 'south', user });
    await publishTicketChanged(pubsub, 'north', ticket());
    expect(await live.outcome()).toBe('nothing');
    await publishTicketChanged(pubsub, 'south', ticket({ _id: 't2' }));
    expect((await live.next).value.data.ticketListChanged._id).toBe('t2');
    await live.iterator.return();
  },
  { hint: 'Everyone listens to one list channel, so the filter must compare subdomains.' },
);

test(
  'the priority filter is optional',
  async () => {
    const { pubsub, schema } = setup();
    const live: any = await listen(schema, LIST, { subdomain: 'north', user }, { priority: 'high' });
    await publishTicketChanged(pubsub, 'north', ticket({ priority: 'low' }));
    expect(await live.outcome()).toBe('nothing');
    await publishTicketChanged(pubsub, 'north', ticket({ _id: 't3', priority: 'high' }));
    expect((await live.next).value.data.ticketListChanged._id).toBe('t3');
    await live.iterator.return();
    const all: any = await listen(schema, LIST, { subdomain: 'north', user });
    await publishTicketChanged(pubsub, 'north', ticket({ _id: 't4', priority: 'low' }));
    expect((await all.next).value.data.ticketListChanged._id).toBe('t4');
    await all.iterator.return();
  },
  { hint: 'No priority variable means every priority.' },
);

test(
  'the same ticket ID in two subdomains stays apart on the detail channel',
  async () => {
    const { pubsub, schema } = setup();
    const south: any = await listen(schema, DETAIL, { subdomain: 'south', user }, { id: 't1' });
    await publishTicketChanged(pubsub, 'north', ticket({ subject: 'North secret' }));
    expect(await south.outcome()).toBe('nothing');
    await publishTicketChanged(pubsub, 'south', ticket({ subject: 'South' }));
    expect((await south.next).value.data).toEqual({ ticketChanged: { _id: 't1', subject: 'South' } });
    await south.iterator.return();
  },
  { hint: 'Put the subdomain in the channel name.' },
);

test(
  'the detail subscription hears only its own ticket',
  async () => {
    const { pubsub, schema } = setup();
    const live: any = await listen(schema, DETAIL, { subdomain: 'north', user }, { id: 't1' });
    await publishTicketChanged(pubsub, 'north', ticket({ _id: 't9' }));
    expect(await live.outcome()).toBe('nothing');
    await live.iterator.return();
  },
  { hint: 'Build the channel from the _id argument.' },
);

test(
  'subscribing requires a login, on both fields',
  async () => {
    const { schema } = setup();
    for (const [document, variables] of [
      [LIST, {}],
      [DETAIL, { id: 't1' }],
    ] as const) {
      const denied: any = await listen(schema, document, { subdomain: 'north' }, variables);
      expect(denied.errors?.[0]?.message).toBe('Login required');
    }
  },
  { hint: 'Check inside subscribe, before you return an iterator.' },
);
