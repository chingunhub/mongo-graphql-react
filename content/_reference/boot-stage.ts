// Runs a Taskforge API that has no server/index.ts yet. Module 13 replaces this with your own entry point.
import mongoose from 'mongoose';
import { startStandaloneServer } from '@apollo/server/standalone';
import { createApolloServer } from '../server/graphql/server';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';
import { stageContext } from './stage-context';
import { seed } from './seed';

const port = Number(process.env.PORT ?? 4000);

await mongoose.connect(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/taskforge');
await Promise.all([User, Project, Issue, Comment].map((model) => model.syncIndexes()));

if (process.env.RESEED || (await User.countDocuments()) === 0) {
  console.log('[boot] seeding demo data…');
  await seed();
}

const server = createApolloServer();
const { url } = await startStandaloneServer(server, { listen: { port }, context: stageContext });

console.log(`[boot] ready ${url}`);

const shutdown = async () => {
  await server.stop().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
