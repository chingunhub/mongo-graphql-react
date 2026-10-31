import { expect } from 'expect';
import { graphql } from 'graphql';
import { ApolloGateway, IntrospectAndCompose, LocalGraphQLDataSource } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { execute, resetDb } from '@forge/kit';
import { Contact } from '../services/contacts/model';
import { Ticket } from '../services/tickets/model';
import { ingest } from '../services/tickets/intake';
import { buildContext } from '../packages/contracts/context';
import { contactSubgraph, ticketSubgraph } from '../services/subgraphs';
const context = (tenant: string) => buildContext({ id: 'ada', memberships: { [tenant]: 'agent' } }, tenant, 'r');
beforeAll(async () => {
  await Promise.all([Contact.init(), Ticket.init()]);
});
beforeEach(resetDb);
test(
  'gateway composes and joins the correct tenant contact',
  async () => {
    await Contact.create([
      { tenant: 'n', id: 'c1', name: 'North' },
      { tenant: 's', id: 'c1', name: 'South' },
    ]);
    await ingest(context('n'), {
      sourceId: 'a',
      subject: 'North ticket',
      contactId: 'c1',
    });
    await ingest(context('s'), {
      sourceId: 'a',
      subject: 'South ticket',
      contactId: 'c1',
    });
    const schemas = { contacts: contactSubgraph(), tickets: ticketSubgraph() };
    const gateway = new ApolloGateway({
      supergraphSdl: new IntrospectAndCompose({
        subgraphs: [
          { name: 'contacts', url: 'http://local.invalid/contacts' },
          { name: 'tickets', url: 'http://local.invalid/tickets' },
        ],
      }),
      buildService: ({ name }) => new LocalGraphQLDataSource(schemas[name as keyof typeof schemas]),
    });
    const server = new ApolloServer({ gateway });
    try {
      await server.start();
      const r = await execute(server, '{ tickets { id tenant subject contact { id name } } }', undefined, context('n'));
      expect(r.errors).toBeUndefined();
      expect(r.data.tickets).toHaveLength(1);
      expect(r.data.tickets[0]).toMatchObject({
        tenant: 'n',
        subject: 'North ticket',
        contact: { id: 'c1', name: 'North' },
      });
    } finally {
      await server.stop();
    }
  },
  {
    timeout: 15000,
    hint: 'Both key fields must travel through the representation to the owning subgraph.',
  },
);
test('direct entity entry point rejects foreign tenant', async () => {
  await Contact.create({ tenant: 's', id: 'c1', name: 'Secret' });
  const r = await graphql({
    schema: contactSubgraph(),
    source: '{ _entities(representations:[{__typename:"Contact",tenant:"s",id:"c1"}]) { ... on Contact { name } } }',
    contextValue: context('n'),
  });
  expect(r.errors).toBeUndefined();
  expect(r.data?._entities).toEqual([null]);
});
test('a key naming another tenant resolves to nothing, even when the caller owns the same id', async () => {
  await Contact.create([
    { tenant: 'n', id: 'c1', name: 'Mine' },
    { tenant: 's', id: 'c1', name: 'Secret' },
  ]);
  const r = await graphql({
    schema: contactSubgraph(),
    source: '{ _entities(representations:[{__typename:"Contact",tenant:"s",id:"c1"}]) { ... on Contact { name } } }',
    contextValue: context('n'),
  });
  expect(r.errors).toBeUndefined();
  expect(r.data?._entities).toEqual([null]);
});
test('ordinary contact lookup is scoped and misses return null', async () => {
  await Contact.create({ tenant: 's', id: 'c1', name: 'Secret' });
  const r = await graphql({
    schema: contactSubgraph(),
    source: '{ contact(id:"c1") { name } }',
    contextValue: context('n'),
  });
  expect(r.errors).toBeUndefined();
  expect(r.data?.contact).toBeNull();
});
test('ticket list preserves nullable contact contract and ID mapping', async () => {
  const t = await ingest(context('n'), {
    sourceId: 'a',
    subject: 'Ticket',
    contactId: 'gone',
  });
  const r = await graphql({
    schema: ticketSubgraph(),
    source: '{ tickets { id subject } }',
    contextValue: context('n'),
  });
  expect(r.errors).toBeUndefined();
  expect(JSON.parse(JSON.stringify(r.data))).toEqual({
    tickets: [{ id: String(t._id), subject: 'Ticket' }],
  });
  const field = ticketSubgraph().getType('Ticket') as any;
  expect(String(field.getFields().contact.type)).toBe('Contact');
});
test('invalid role cannot list tickets either', async () => {
  const r = await graphql({
    schema: ticketSubgraph(),
    source: '{ tickets { id } }',
    contextValue: { ...context('n'), role: 'invalid' },
  });
  expect(r.errors?.[0].message).toContain('FORBIDDEN');
});
test('invalid role fails every entry point', async () => {
  const ctx = { ...context('n'), role: 'invalid' };
  for (const source of [
    '{ contact(id:"x") { name } }',
    '{ _entities(representations:[{__typename:"Contact",tenant:"n",id:"x"}]) { ... on Contact { name } } }',
  ]) {
    const r = await graphql({
      schema: contactSubgraph(),
      source,
      contextValue: ctx,
    });
    expect(r.errors?.[0].message).toContain('FORBIDDEN');
  }
});
