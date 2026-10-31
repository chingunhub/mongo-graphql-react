// Forge Academy launcher, the same on Windows and Mac: start what's missing, then open the app in its own window.
// `npm run app`, or the desktop icon. `-- stop` stops the server, and `-- --no-open` skips the window.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIN_NODE,
  ROOT,
  appBrowsers,
  background,
  canBuild,
  doctorCommand,
  isForgeUp,
  loadPaths,
  mongoPlan,
  nodeIsNewEnough,
  portState,
  uiIsStale,
  useInstallLayout,
} from './app-lib.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Launched from an icon there's no terminal, so the message needs a dialog. */
function fail(message) {
  console.error(message);
  if (!process.stdout.isTTY) {
    const env = { ...process.env, FORGE_MESSAGE: message };
    if (process.platform === 'win32')
      spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($env:FORGE_MESSAGE, 'Forge Academy') | Out-Null",
        ],
        { env, windowsHide: true },
      );
    if (process.platform === 'darwin')
      spawnSync(
        'osascript',
        ['-e', 'display alert "Forge Academy" message (system attribute "FORGE_MESSAGE")'],
        { env },
      );
  }
  process.exit(1);
}

async function waitFor(ready, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await ready()) return true;
    await sleep(400);
  }
  return false;
}

/** Returns what the server needs to know about MongoDB. */
async function prepareMongo(paths) {
  const plan = mongoPlan({ isWorktree: paths.IS_WORKTREE });
  if (plan.kind === 'given') return {};
  if (plan.kind === 'system') {
    // The sandbox and reference API need it, but lessons don't, so the course still opens without it.
    if ((await portState(plan.port)) === 'free' && process.platform === 'win32')
      spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Service MongoDB'], { windowsHide: true });
    return {};
  }
  const log = join(paths.DATA_DIR, 'mongod.log');
  const state = await portState(plan.port);
  if (state === 'other')
    fail(`Port ${plan.port} is in use by another program, so MongoDB can't start. For help, run: ${doctorCommand()}`);
  if (state === 'free') {
    const dbPath = join(paths.DATA_DIR, 'mongodb');
    mkdirSync(dbPath, { recursive: true });
    const args = ['--port', plan.port, '--bind_ip', '127.0.0.1', '--dbpath', dbPath, '--logpath', log, '--logappend'];
    background(plan.binary, args.map(String)).on('error', (error) =>
      fail(`MongoDB couldn't start: ${error.message}\nA security tool may be blocking ${plan.binary}.`),
    );
    if (!(await waitFor(async () => (await portState(plan.port)) === 'mongo', 30)))
      fail(`MongoDB didn't start. See ${log}`);
  }
  return { FORGE_MONGO: plan.uri, FORGE_PRIVATE_MONGO: '1' };
}

function buildUi() {
  if (!uiIsStale()) return;
  const built = existsSync(join(ROOT, 'dist', 'web', 'index.html'));
  if (canBuild()) {
    const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    const args = [vite, 'build', '--config', 'web/vite.config.ts'];
    const { status } = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'ignore', windowsHide: true });
    if (status === 0) return;
  }
  if (!built) fail(`The Forge Academy interface could not be built. For help, run: ${doctorCommand()}`);
}

function startServer(paths, env) {
  const out = openSync(join(paths.DATA_DIR, 'server.log'), 'w');
  const err = openSync(join(paths.DATA_DIR, 'server.err.log'), 'w');
  background(process.execPath, ['--import', 'tsx', 'server/main.ts'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', out, err],
  });
}

function openWindow(url) {
  // Own window, no tabs or address bar. Fall back to the default browser.
  const browser = appBrowsers().find((path) => existsSync(path));
  if (browser) background(browser, ['--app=' + url, '--window-size=1440,920']);
  else if (process.platform === 'win32') background('cmd.exe', ['/c', 'start', '', url]);
  else background(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
}

if (!nodeIsNewEnough()) fail(`Forge Academy needs Node ${MIN_NODE} or newer, and this is ${process.version}.`);
useInstallLayout();
const paths = await loadPaths();
const url = `http://127.0.0.1:${paths.PORT}/`;

if (process.argv.includes('stop')) {
  await fetch(url + 'api/shutdown', { method: 'POST' }).catch(() => {});
  process.exit(0);
}

if (!(await isForgeUp(paths.PORT))) {
  mkdirSync(paths.DATA_DIR, { recursive: true });
  const mongo = await prepareMongo(paths);
  buildUi();
  startServer(paths, { ...process.env, ...mongo });
  if (!(await waitFor(() => isForgeUp(paths.PORT), 40)))
    fail(`The Forge Academy server didn't start. See ${join(paths.DATA_DIR, 'server.err.log')}`);
}
if (!process.argv.includes('--no-open')) openWindow(url);
