import { ApolloServer } from '@apollo/server';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { formatError } from './errors';

export function createServer(): ApolloServer {
  return new ApolloServer({ typeDefs, resolvers, formatError });
}
