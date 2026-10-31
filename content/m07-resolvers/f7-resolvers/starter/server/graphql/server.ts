import { ApolloServer } from '@apollo/server';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';

/** Builds (but does not start) the Taskforge GraphQL server. */
export function createApolloServer(): ApolloServer {
  // TODO
  return null as unknown as ApolloServer;
}
