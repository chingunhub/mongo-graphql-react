// `npm run release`: makes release/, which is everything a student's installer downloads.
// The installers get the exact versions and hashes stamped in, so one pasted line needs nothing else first.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './app-lib.mjs';

const OUT = join(ROOT, 'release');
const STAGE = join(OUT, 'stage', 'forge-academy');
// Everything else stays in the repo: students run the course, not its tests or plans.
const SHIPPED = /^(LICENSE|README\.md|package(-lock)?\.json|tsconfig\.json|(assets|content|sandbox|scripts|server|shared|web)\/)/;

const run = (command, args, cwd = ROOT) => {
  const { status, stdout } = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  if (status !== 0) throw Error(`${command} ${args[0]} failed`);
  return stdout;
};

/** A Mac icon: the PNG inside forge.ico, in the smallest wrapper macOS accepts. */
function macIcon() {
  const png = readFileSync(join(ROOT, 'assets', 'forge.ico')).subarray(22);
  const entry = Buffer.alloc(8);
  entry.write('ic08');
  entry.writeUInt32BE(png.length + 8, 4);
  const header = Buffer.alloc(8);
  header.write('icns');
  header.writeUInt32BE(png.length + 16, 4);
  return Buffer.concat([header, entry, png]);
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const pins = JSON.parse(readFileSync(join(ROOT, 'install', 'manifest.json'), 'utf8'));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

run(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'web/vite.config.ts']);
const files = run('git', ['ls-files', '--cached', '--others', '--exclude-standard']).split('\n');
for (const file of files.filter((name) => SHIPPED.test(name))) {
  mkdirSync(dirname(join(STAGE, file)), { recursive: true });
  cpSync(join(ROOT, file), join(STAGE, file));
}
cpSync(join(ROOT, 'dist', 'web'), join(STAGE, 'dist', 'web'), { recursive: true });
writeFileSync(join(STAGE, 'assets', 'forge.icns'), macIcon());
writeFileSync(
  join(STAGE, 'installed.json'),
  JSON.stringify({ version: pkg.version, release: pins.releaseUrl }, null, 2) + '\n',
);

const archive = `forge-academy-${pkg.version}.tar.gz`;
const tar = process.platform === 'win32' ? join(process.env.WINDIR, 'System32', 'tar.exe') : 'tar';
run(tar, ['-czf', join('..', archive), 'forge-academy'], join(OUT, 'stage'));
rmSync(join(OUT, 'stage'), { recursive: true, force: true });

const app = {
  version: pkg.version,
  file: archive,
  sha256: createHash('sha256').update(readFileSync(join(OUT, archive))).digest('hex'),
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(app, null, 2) + '\n');

const stamped = { ...pins, app };
const ps1 = readFileSync(join(ROOT, 'install', 'install.ps1'), 'utf8');
writeFileSync(join(OUT, 'install.ps1'), ps1.replace('__MANIFEST__', () => JSON.stringify(stamped, null, 2)));
const shellPins = [
  ['RELEASE_URL', pins.releaseUrl],
  ['APP_VERSION', app.version],
  ['APP_FILE', app.file],
  ['APP_SHA256', app.sha256],
  ['NODE_VERSION', pins.node.version],
  ['NODE_ARM64_URL', pins.node['darwin-arm64'].url],
  ['NODE_ARM64_SHA256', pins.node['darwin-arm64'].sha256],
  ['NODE_X64_URL', pins.node['darwin-x64'].url],
  ['NODE_X64_SHA256', pins.node['darwin-x64'].sha256],
  ['MONGO_VERSION', pins.mongodb.version],
  ['MONGO_ARM64_URL', pins.mongodb['darwin-arm64'].url],
  ['MONGO_ARM64_SHA256', pins.mongodb['darwin-arm64'].sha256],
  ['MONGO_X64_URL', pins.mongodb['darwin-x64'].url],
  ['MONGO_X64_SHA256', pins.mongodb['darwin-x64'].sha256],
].map(([name, value]) => `${name}="${value}"`);
const sh = readFileSync(join(ROOT, 'install', 'install.sh'), 'utf8');
writeFileSync(join(OUT, 'install.sh'), sh.replace('# __PINS__', () => shellPins.join('\n')));

console.log(`release/${archive}  ${(statSync(join(OUT, archive)).size / 1024 ** 2).toFixed(1)} MB  sha256 ${app.sha256}`);
if (!pins.releaseUrl) console.log('install/manifest.json has no releaseUrl yet, so this release only works with FORGE_RELEASE.');
