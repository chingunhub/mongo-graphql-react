// `npm run doctor`: checks everything the course needs, and says what to do about anything that's wrong.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIN_NODE,
  ROOT,
  isForgeUp,
  isInstalled,
  loadPaths,
  mongoPlan,
  nodeIsNewEnough,
  portState,
  useInstallLayout,
} from './app-lib.mjs';

const MIN_FREE_GB = 2;
const report = (ok, name, detail, fix) => {
  console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
  if (!ok) console.log(`    Fix: ${fix}`);
  return ok;
};

if (!nodeIsNewEnough()) {
  report(false, 'Node', process.version, `install Node ${MIN_NODE} or newer from https://nodejs.org`);
  process.exit(1);
}
useInstallLayout();
const paths = await loadPaths();
const results = [report(true, 'Node', process.version)];
const reinstall = 'run the install line again';

results.push(
  report(
    existsSync(join(ROOT, 'node_modules', 'tsx', 'package.json')),
    'Packages',
    existsSync(join(ROOT, 'node_modules')) ? 'installed' : 'missing',
    isInstalled() ? reinstall : 'run "npm ci" in the course folder',
  ),
);

const built = existsSync(join(ROOT, 'dist', 'web', 'index.html'));
results.push(
  report(built, 'Interface', built ? 'built' : 'not built', isInstalled() ? reinstall : 'run "npm run build"'),
);

let writable = true;
try {
  mkdirSync(paths.DATA_DIR, { recursive: true });
  const probe = join(paths.DATA_DIR, '.doctor-probe');
  writeFileSync(probe, '');
  rmSync(probe);
} catch {
  writable = false;
}
results.push(
  report(
    writable,
    'Data folder',
    paths.DATA_DIR,
    "this folder can't be written to. Check its permissions, or point FORGE_DATA at another folder",
  ),
);
if (writable) {
  const { bavail, bsize } = statfsSync(paths.DATA_DIR);
  const free = (bavail * bsize) / 1024 ** 3;
  results.push(
    report(free >= MIN_FREE_GB, 'Disk space', `${free.toFixed(1)} GB free`, `free up at least ${MIN_FREE_GB} GB`),
  );
}

const forgeUp = await isForgeUp(paths.PORT);
const plan = mongoPlan({ isWorktree: paths.IS_WORKTREE });
if (plan.kind === 'given') {
  const { hostname, port } = new URL(plan.uri);
  const state = await portState(Number(port || 27017), hostname);
  results.push(
    report(state === 'mongo', 'MongoDB', plan.uri, `FORGE_MONGO doesn't reach a running MongoDB. Start it or unset FORGE_MONGO`),
  );
} else if (plan.kind === 'system') {
  const state = await portState(plan.port);
  results.push(
    report(
      state === 'mongo',
      'MongoDB',
      state === 'mongo' ? 'running on port 27017' : 'not running on port 27017',
      process.platform === 'darwin'
        ? 'run "brew services start mongodb-community", or install it from https://www.mongodb.com/try/download/community'
        : 'start the MongoDB service, or install it from https://www.mongodb.com/try/download/community',
    ),
  );
} else {
  const { status } = spawnSync(plan.binary, ['--version'], { windowsHide: true, stdio: 'ignore' });
  const state = await portState(plan.port);
  results.push(
    report(
      status === 0,
      'MongoDB program',
      plan.binary,
      `a security tool may be blocking it, or the install is damaged. Try: ${reinstall}`,
    ),
    report(
      state !== 'other',
      `Port ${plan.port}`,
      state === 'mongo' ? 'private MongoDB running' : state,
      'another program is using it. Close that program, or set FORGE_MONGO_PORT',
    ),
  );
}

const ports = [
  ['Course', paths.PORT, 'FORGE_PORT'],
  ['Reference API', paths.REFERENCE_PORT, 'FORGE_REFERENCE_PORT'],
  ['Your project', paths.LAUNCH_PORT, 'FORGE_LAUNCH_PORT'],
];
for (const [name, port, setting] of ports) {
  const state = await portState(port);
  const ours = forgeUp && state !== 'free';
  results.push(
    report(
      state === 'free' || ours,
      `${name} port ${port}`,
      ours ? 'in use by Forge Academy' : state === 'free' ? 'free' : 'in use by another program',
      `close that program, or set ${setting} to another port`,
    ),
  );
}

const ok = results.every(Boolean);
console.log(ok ? '\nEverything looks good.' : '\nFix the items marked ✗, then run this again.');
process.exit(ok ? 0 : 1);
