import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { ROOT, queueServer } from './app-lib.mjs';

const server = queueServer();
if (!server)
  throw Error(
    process.platform === 'win32'
      ? 'Memurai executable not found. Set FORGE_REDIS_SERVER, or use Redis on port 6397.'
      : 'redis-server not found. Run "brew install redis", or set FORGE_REDIS_SERVER.',
  );
const inUse = await new Promise((resolve) => {
  const socket = createConnection({ host: '127.0.0.1', port: 6397 });
  socket.on('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.on('error', () => resolve(false));
});
if (inUse) throw Error('Port 6397 is already in use. No existing process was stopped. Use it if it is your queue lab.');
const dir = join(process.env.FORGE_DATA ?? join(ROOT, 'data'), 'queue-lab');
await mkdir(dir, { recursive: true });
const slash = (path) => path.replaceAll('\\', '/');
const config = join(dir, 'queue-lab.conf');
await writeFile(
  config,
  [
    'bind 127.0.0.1',
    'protected-mode yes',
    'port 6397',
    'save ""',
    'appendonly no',
    'dir "' + slash(dir) + '"',
    'dbfilename lab.rdb',
    'logfile "' + slash(join(dir, 'queue-lab.log')) + '"',
    '',
  ].join('\n'),
);
const child = spawn(server.binary, [config], {
  cwd: dir,
  windowsHide: true,
  stdio: 'ignore',
});
console.log('Isolated ' + server.name + ' lab on 127.0.0.1:6397. Data/logs: ' + dir);
console.log('No installed service is changed. Ctrl+C stops only this process.');
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
const stop = () => {
  child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
