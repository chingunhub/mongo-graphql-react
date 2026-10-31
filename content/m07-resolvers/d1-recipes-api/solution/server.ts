import { ApolloServer } from '@apollo/server';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';

export function createServer(): ApolloServer {
  return new ApolloServer({ typeDefs, resolvers });
}
