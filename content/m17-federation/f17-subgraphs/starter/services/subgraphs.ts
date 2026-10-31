import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';
import { Contact } from './contacts/model';
import { Ticket } from './tickets/model';
import { requireAction, type Context } from '../packages/contracts/context';
export function contactSubgraph() {
  return buildSubgraphSchema([{ typeDefs: parse('type Query { ping: String }'), resolvers: {} }]);
}
export function ticketSubgraph() {
  return buildSubgraphSchema([{ typeDefs: parse('type Query { placeholder: String }'), resolvers: {} }]);
}
