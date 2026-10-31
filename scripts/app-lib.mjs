// What the launcher and `npm run doctor` share. No dependencies: this runs before anything else is known to work.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MIN_NODE = 24;

export const nodeIsNewEnough = (version = process.versions.node) => Number(version.split('.')[0]) >= MIN_NODE;

/** The server's own settings. Node runs this small file directly, so it needs a Node that can, and not tsx. */
export const loadPaths = () => import('../server/paths.ts');

export const isInstalled = (root = ROOT) => existsSync(join(root, 'installed.json'));

/** An installed copy keeps student data and its own MongoDB beside the program, which updates replace. */
export function useInstallLayout({ root = ROOT, env = process.env, platform = process.platform } = {}) {
  if (!isInstalled(root)) return;
  env.FORGE_DATA ??= join(root, '..', 'data');
  env.FORGE_MONGOD ??= join(root, '..', 'runtime', 'mongodb', 'bin', platform === 'win32' ? 'mongod.exe' : 'mongod');
}

/** How to reach the doctor. An installed copy has no npm on PATH. */
export const doctorCommand = (root = ROOT) =>
  isInstalled(root) ? `"${process.execPath}" "${join(root, 'scripts', 'doctor.mjs')}"` : 'npm run doctor';

/** Where MongoDB comes from: an explicit address, the private mongod, or the system one. */
export function mongoPlan({
  env = process.env,
  platform = process.platform,
  isWorktree = false,
  root = ROOT,
  exists = existsSync,
} = {}) {
  if (env.FORGE_MONGO) return { kind: 'given', uri: env.FORGE_MONGO };
  const binary =
    env.FORGE_MONGOD ?? join(root, 'runtime', 'mongodb', 'bin', platform === 'win32' ? 'mongod.exe' : 'mongod');
  if (!exists(binary)) return { kind: 'system', uri: 'mongodb://127.0.0.1:27017', port: 27017 };
  const port = Number(env.FORGE_MONGO_PORT ?? (isWorktree ? 4537 : 4527));
  return { kind: 'private', uri: 'mongodb://127.0.0.1:' + port, port, binary };
}

/** MongoDB's `hello` command as bytes on the wire: this runs before the driver is known to be installed. */
function helloMessage() {
  const text = (name, value) =>
    Buffer.concat([
      Buffer.from('\x02' + name + '\0'),
      Buffer.from(Int32Array.of(value.length + 1).buffer),
      Buffer.from(value + '\0'),
    ]);
  const fields = Buffer.concat([
    Buffer.from('\x10hello\0'),
    Buffer.from(Int32Array.of(1).buffer),
    text('$db', 'admin'),
    Buffer.from([0]),
  ]);
  const body = Buffer.concat([
    Buffer.from(Int32Array.of(fields.length + 4).buffer),
    fields,
  ]);
  const header = Buffer.from(Int32Array.of(16 + 5 + body.length, 1, 0, 2013, 0).buffer);
  return Buffer.concat([header, Buffer.from([0]), body]);
}

/** 'free', 'mongo', or 'other'. Only mongod answers `hello` with its wire version. */
export function portState(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let connected = false;
    let reply = '';
    const done = (state) => {
      socket.destroy();
      resolve(state);
    };
    socket.setTimeout(1500, () => done('other'));
    socket.on('connect', () => {
      connected = true;
      socket.write(helloMessage());
    });
    socket.on('data', (chunk) => {
      reply += chunk.toString('latin1');
      if (reply.includes('maxWireVersion')) done('mongo');
    });
    socket.on('end', () => done('other'));
    socket.on('error', () => done(connected ? 'other' : 'free'));
  });
}

export async function isForgeUp(port) {
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/api/health', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
    const body = await response.json();
    return body.ok === true && 'reference' in body;
  } catch {
    return false;
  }
}

function newest(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(0, ...readdirSync(path).map((name) => newest(join(path, name))));
}

/** A `git pull` must not keep serving the old UI, so any source newer than the build counts. */
export function uiIsStale(root = ROOT) {
  const built = join(root, 'dist', 'web', 'index.html');
  if (!existsSync(built)) return true;
  return Math.max(newest(join(root, 'web')), newest(join(root, 'package-lock.json'))) > statSync(built).mtimeMs;
}

/** An installed copy has a finished build and no vite, so it never rebuilds. */
export const canBuild = (root = ROOT) => existsSync(join(root, 'node_modules', 'vite', 'bin', 'vite.js'));

/** Starts something that outlives this process, with no console window on Windows. */
export function background(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'ignore', ...options, detached: true, windowsHide: true });
  child.unref();
  return child;
}

export function appBrowsers({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === 'win32')
    return [
      join(env['ProgramFiles(x86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
      join(env.ProgramFiles ?? '', 'Microsoft/Edge/Application/msedge.exe'),
      join(env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe'),
      join(env['ProgramFiles(x86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
      join(env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    ];
  if (platform === 'darwin')
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  return [];
}

/** The program behind `npm run queue:lab`: Memurai on Windows, redis-server elsewhere. */
export function queueServer({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  const chosen = env.FORGE_REDIS_SERVER ?? env.FORGE_MEMURAI;
  if (platform === 'win32') {
    const binary = chosen ?? 'C:/Program Files/Memurai/memurai.exe';
    return exists(binary) ? { name: 'Memurai', binary } : null;
  }
  const places = [chosen, '/opt/homebrew/bin/redis-server', '/usr/local/bin/redis-server', '/usr/bin/redis-server'];
  const binary = places.find((place) => place && exists(place));
  return binary ? { name: 'Redis', binary } : null;
}
