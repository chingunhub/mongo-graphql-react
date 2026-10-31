// Entry point for running a Taskforge workspace as a real server (reference API, or "Launch").
import mongoose from 'mongoose';
import { startServer } from '../server/index';
import { User } from '../server/models/User';
import { seed } from './seed';

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/taskforge';

const running = await startServer({ port, mongoUri });

if (process.env.RESEED || (await User.countDocuments()) === 0) {
  console.log('[boot] seeding demo data…');
  await seed();
}

console.log(`[boot] ready ${running.url}`);

const shutdown = async () => {
  await running.stop().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
