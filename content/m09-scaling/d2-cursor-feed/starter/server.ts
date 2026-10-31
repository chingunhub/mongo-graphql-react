import { ApolloServer } from '@apollo/server';
import { typeDefs } from './schema';
import { feedConnection } from './feed';

const resolvers = {
  Query: {
    feed: (_: unknown, args: { first?: number; after?: string | null }) => feedConnection(args),
  },
  Post: {
    id: (p: any) => String(p._id),
    createdAt: (p: any) => p.createdAt.toISOString(),
  },
};

export function createServer() {
  return new ApolloServer({ typeDefs, resolvers });
}
