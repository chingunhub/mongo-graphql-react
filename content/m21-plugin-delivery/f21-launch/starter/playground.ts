import { boot } from './services/lifecycle';
const log: string[] = [];
const app = await boot({
  connect: async () => {
    log.push('connect');
  },
  ensureIndexes: async () => {
    log.push('indexes');
  },
  serve: async () => ({
    url: 'http://example.local',
    stop: async () => {
      log.push('stop HTTP');
    },
  }),
  disconnect: async () => {
    log.push('disconnect');
  },
});
await app.stop();
await app.stop();
console.log(log);
