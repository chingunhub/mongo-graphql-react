import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startRelaydesk } from './start';
import { seedDemo } from './seed';
const root = process.cwd();
const port = Number(process.env.RELAYDESK_PORT ?? 4810);
const mongoUri = process.env.RELAYDESK_MONGO ?? 'mongodb://127.0.0.1:27017/forge_relaydesk_local';
const webDir = join(root, 'public');
await mkdir(webDir, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['web/main.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  jsx: 'automatic',
  outfile: join(webDir, 'bundle.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});
await writeFile(
  join(webDir, 'index.html'),
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relaydesk</title><link rel="icon" href="data:,"><link rel="stylesheet" href="./bundle.css"></head><body><div id="root"></div><script type="module" src="./bundle.js"></script></body></html>',
);
const system = await startRelaydesk({
  port,
  mongoUri,
  webDir,
  redisUrl: process.env.RELAYDESK_REDIS,
  queueNamespace: process.env.RELAYDESK_QUEUE_PREFIX ?? 'forge-relaydesk-local',
});
await seedDemo(process.env.RELAYDESK_RESET === '1');
console.log('[relaydesk] ready ' + system.url);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    await system.stop();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.on('message', (message) => {
  if (message === 'shutdown') void shutdown();
});
