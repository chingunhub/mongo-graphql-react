import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';
import { Contact } from './contacts/model';
import { Ticket } from './tickets/model';
import { requireAction, type Context } from '../packages/contracts/context';
const link = 'extend schema @link(url:"https://specs.apollo.dev/federation/v2.3", import:["@key"])';
export function contactSubgraph() {
  return buildSubgraphSchema([
    {
      typeDefs: parse(
        link +
          `
      type Contact @key(fields:"tenant id") { tenant: ID! id: ID! name: String! }
      type Query { contact(id: ID!): Contact }`,
      ),
      resolvers: {
        Query: {
          contact: (_: unknown, { id }: { id: string }, ctx: Context) => {
            requireAction(ctx, 'tickets:read');
            return Contact.findOne({ tenant: ctx.tenant, id }).lean().exec();
          },
        },
        Contact: {
          __resolveReference: (ref: { tenant: string; id: string }, ctx: Context) => {
            requireAction(ctx, 'tickets:read');
            if (ref.tenant !== ctx.tenant) return null;
            return Contact.findOne({ tenant: ctx.tenant, id: ref.id }).lean().exec();
          },
        },
      },
    },
  ]);
}
export function ticketSubgraph() {
  return buildSubgraphSchema([
    {
      typeDefs: parse(
        link +
          `
      type Contact @key(fields:"tenant id", resolvable:false) { tenant: ID! id: ID! }
      type Ticket { id: ID! tenant: ID! subject: String! priority: String! version: Int! contact: Contact }
      type Query { tickets: [Ticket!]! }`,
      ),
      resolvers: {
        Query: {
          tickets: (_: unknown, _args: unknown, ctx: Context) => {
            requireAction(ctx, 'tickets:read');
            return Ticket.find({ tenant: ctx.tenant }).sort({ _id: 1 }).lean().exec();
          },
        },
        Ticket: {
          id: (row: { _id: unknown }) => String(row._id),
          contact: (row: { tenant: string; contactId: string }) => ({
            __typename: 'Contact',
            tenant: row.tenant,
            id: row.contactId,
          }),
        },
      },
    },
  ]);
}
