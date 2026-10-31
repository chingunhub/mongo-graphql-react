import mongoose from 'mongoose';
import { startStandaloneServer } from '@apollo/server/standalone';
import { createApolloServer } from './graphql/server';
import { buildContext } from './graphql/context';
import { User } from './models/User';
import { Project } from './models/Project';
import { Issue } from './models/Issue';
import { Comment } from './models/Comment';

export interface RunningServer {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Connect to MongoDB, make sure indexes exist, and start serving GraphQL over HTTP.
 * Nothing happens on import — whoever calls this decides when (and with which config).
 */
export async function startServer({ port = 4000, mongoUri }: { port?: number; mongoUri: string }): Promise<RunningServer> {
  await mongoose.connect(mongoUri);
  // Unique indexes are how uniqueness is enforced — build them before taking traffic.
  await Promise.all([User, Project, Issue, Comment].map((model) => model.syncIndexes()));

  const server = createApolloServer();
  const { url } = await startStandaloneServer(server, {
    listen: { port },
    context: ({ req }) => buildContext({ req }),
  });

  return {
    url,
    stop: async () => {
      await server.stop();
      await mongoose.disconnect();
    },
  };
}
