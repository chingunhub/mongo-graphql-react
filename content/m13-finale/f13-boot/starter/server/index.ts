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
  // TODO
  throw new Error('Not implemented');
}
