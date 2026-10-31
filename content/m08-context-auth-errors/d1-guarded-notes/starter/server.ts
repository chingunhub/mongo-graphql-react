import { ApolloServer } from '@apollo/server';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { formatError } from './errors';

export function createServer(): ApolloServer {
  // TODO: don't forget formatError
  return new ApolloServer({ typeDefs, resolvers });
}
