import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appBrowsers, mongoPlan, portState, queueServer, uiIsStale } from '../scripts/app-lib.mjs';
import { relaydeskScaffold } from '../server/relaydesk-export';

const listen = (reply?: string) =>
  new Promise<{ server: Server; port: number }>((resolve) => {
    const server = createServer((socket) => {
      socket.on('error', () => {});
      socket.once('data', () => (reply === undefined ? socket.destroy() : socket.end(reply)));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port }));
  });

test('a checkout with no private mongod keeps using the system MongoDB', () => {
  const plan = mongoPlan({ env: {}, exists: () => false });
  assert.deepEqual(plan, { kind: 'system', uri: 'mongodb://127.0.0.1:27017', port: 27017 });
});

test('a private mongod takes a port of its own, separate for a worktree', () => {
  const main = mongoPlan({ env: {}, exists: () => true, platform: 'darwin', root: '/app' });
  assert.equal(main.kind, 'private');
  assert.equal(main.uri, 'mongodb://127.0.0.1:4527');
  assert.equal(main.binary, join('/app', 'runtime', 'mongodb', 'bin', 'mongod'));
  assert.equal(mongoPlan({ env: {}, exists: () => true, isWorktree: true }).port, 4537);
  assert.equal(mongoPlan({ env: {}, exists: () => true, platform: 'win32', root: '/app' }).binary?.endsWith('mongod.exe'), true);
});

test('an explicit FORGE_MONGO beats a private mongod', () => {
  const plan = mongoPlan({ env: { FORGE_MONGO: 'mongodb://127.0.0.1:9999' }, exists: () => true });
  assert.deepEqual(plan, { kind: 'given', uri: 'mongodb://127.0.0.1:9999' });
});

test('a port is reported as free, MongoDB, or something else', async () => {
  const mongo = await listen('\x10maxWireVersion\0\x19\0\0\0');
  const other = await listen('HTTP/1.0 200 OK\r\n\r\nhello');
  const hangsUp = await listen();
  try {
    assert.equal(await portState(mongo.port), 'mongo');
    assert.equal(await portState(other.port), 'other');
    assert.equal(await portState(hangsUp.port), 'other');
  } finally {
    mongo.server.close();
    other.server.close();
    hangsUp.server.close();
  }
  assert.equal(await portState(mongo.port), 'free');
});

test('the UI counts as stale when it is missing or older than its source', () => {
  const root = mkdtempSync(join(tmpdir(), 'forge-ui-'));
  try {
    mkdirSync(join(root, 'web', 'src'), { recursive: true });
    const source = join(root, 'web', 'src', 'App.tsx');
    writeFileSync(source, '');
    assert.equal(uiIsStale(root), true);

    mkdirSync(join(root, 'dist', 'web'), { recursive: true });
    const built = join(root, 'dist', 'web', 'index.html');
    writeFileSync(built, '');
    utimesSync(source, new Date(1000), new Date(1000));
    assert.equal(uiIsStale(root), false);

    utimesSync(source, new Date(), new Date(Date.now() + 60_000));
    assert.equal(uiIsStale(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the app window has a browser to try on both systems', () => {
  const windows = appBrowsers({ platform: 'win32', env: { ProgramFiles: 'C:/PF', LOCALAPPDATA: 'C:/L' }, home: '' });
  assert.ok(windows.some((path) => path.endsWith('msedge.exe')));
  assert.ok(windows.some((path) => path.endsWith('chrome.exe')));
  const mac = appBrowsers({ platform: 'darwin', env: {}, home: '/Users/me' });
  assert.ok(mac.some((path) => path.includes('Google Chrome.app')));
  assert.ok(mac.some((path) => path.includes('Microsoft Edge.app')));
});

test('the queue lab finds Memurai on Windows and redis-server on Mac', () => {
  const windows = queueServer({ platform: 'win32', env: {}, exists: () => true });
  assert.equal(windows?.name, 'Memurai');
  const mac = queueServer({
    platform: 'darwin',
    env: {},
    exists: (path: string) => path === '/usr/local/bin/redis-server',
  });
  assert.deepEqual(mac, { name: 'Redis', binary: '/usr/local/bin/redis-server' });
  assert.equal(queueServer({ platform: 'darwin', env: {}, exists: () => false }), null);
  const chosen = queueServer({ platform: 'win32', env: { FORGE_MEMURAI: 'D:/m.exe' }, exists: () => true });
  assert.equal(chosen?.binary, 'D:/m.exe');
});

test('FORGE_DATA moves student data out of the program folder', () => {
  const dir = join(tmpdir(), 'forge-data-elsewhere');
  const script = "import('./server/paths.ts').then((p) => console.log(p.DATA_DIR))";
  const output = execFileSync(process.execPath, ['--no-warnings', '-e', script], {
    env: { ...process.env, FORGE_DATA: dir },
    encoding: 'utf8',
  });
  assert.equal(output.trim(), dir);
});

test('the Relaydesk export pins versions without dev packages installed', () => {
  const files = relaydeskScaffold('reference', true);
  const pkg = JSON.parse(files['package.json'] as string);
  assert.match(pkg.devDependencies.nx, /^\d+\.\d+\.\d+/);
  assert.match(pkg.dependencies.mongoose, /^\d+\.\d+\.\d+/);
});
