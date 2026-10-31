// The Mac installer's logic, run by real bash with the Mac-only tools replaced. This can't prove a real Mac works:
// it proves the choices, the order and what happens to a student's files when something goes wrong.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const ROOT = join(import.meta.dirname, '..');
const BASH = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
const skip = existsSync(BASH) ? false : 'needs bash';
const scratch = mkdtempSync(join(tmpdir(), 'forge sh-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const unix = (path: string) =>
  process.platform === 'win32' ? path.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase()) : path;

function bash(script: string, env: Record<string, string> = {}) {
  const { status, stdout, stderr } = spawnSync(BASH, ['-c', script], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status, output: stdout + stderr };
}

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

function archive(dir: string, name: string, files: Record<string, string>) {
  const top = join(dir, 'src-' + name);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(top, 'top', file, '..'), { recursive: true });
    writeFileSync(join(top, 'top', file), text);
  }
  const out = bash(`cd "${unix(top)}" && chmod -R +x top && tar -czf ../${name} top`);
  assert.equal(out.status, 0, out.output);
  return join(dir, name);
}

const fakeNode = `#!/bin/bash
if [ "$1" = --version ]; then echo v24.0.0; exit 0; fi
echo "node $*" >> "$FAKE_LOG"
`;
const fakeNpm = `#!/bin/bash
echo "npm $* in $(basename "$PWD")" >> "$FAKE_LOG"
exit \${FAKE_NPM_STATUS:-0}
`;

const stubs: Record<string, string> = {
  uname: 'echo "${FAKE_UNAME:-Darwin}"',
  sysctl: 'echo "${FAKE_ARM:-1}"',
  df: 'echo "Filesystem 1024-blocks Used Available"; echo "/dev/disk1 999999999 1 ${FAKE_FREE_KB:-99999999}"',
  shasum: 'if command -v sha256sum > /dev/null; then sha256sum "$3"; else /usr/bin/shasum -a 256 "$3"; fi',
  curl: `
    echo "curl $*" >> "$FAKE_LOG"
    while [ $# -gt 1 ]; do
      if [ "$1" = -o ]; then out=$2; fi
      shift
    done
    if [ -n "\${FAKE_CURL_STATUS:-}" ]; then echo partial >> "$out"; exit "$FAKE_CURL_STATUS"; fi
    if [ -f "$out" ]; then echo "resumed $out" >> "$FAKE_LOG"; fi
    if [ -n "\${FAKE_CORRUPT:-}" ]; then echo corrupted > "$out"; else cp "$FAKE_ORIGIN/$(basename "$1")" "$out"; fi`,
  sleep: 'exit 0',
};

/** A fresh machine: stamped installer, fake downloads, and a home folder with a space in it, like a Mac's real one. */
function machine(name: string) {
  const dir = join(scratch, name);
  const origin = join(dir, 'origin');
  const release = join(dir, 'release');
  const bin = join(dir, 'bin');
  for (const path of [origin, release, bin, join(dir, 'home', 'Desktop')]) mkdirSync(path, { recursive: true });
  for (const [tool, body] of Object.entries(stubs)) writeFileSync(join(bin, tool), '#!/bin/bash\n' + body + '\n');
  assert.equal(bash(`chmod +x "${unix(bin)}"/*`).status, 0);

  const node = (arch: string) =>
    archive(origin, `node-${arch}.tar.gz`, { 'bin/node': fakeNode, 'bin/npm': fakeNpm });
  const mongo = (arch: string) =>
    archive(origin, `mongo-${arch}.tgz`, { 'bin/mongod': '#!/bin/bash\nexit 0\n', 'bin/mongos': 'unused' });
  const app = archive(release, 'forge-academy-0.2.0.tar.gz', {
    'scripts/app.mjs': '// new',
    'assets/forge.icns': 'icon',
    'package.json': '{}',
  });
  const pins = {
    RELEASE_URL: '',
    APP_VERSION: '0.2.0',
    APP_FILE: 'forge-academy-0.2.0.tar.gz',
    APP_SHA256: sha256(app),
    NODE_VERSION: '24.0.0',
    NODE_ARM64_URL: 'https://nodejs.test/node-arm64.tar.gz',
    NODE_ARM64_SHA256: sha256(node('arm64')),
    NODE_X64_URL: 'https://nodejs.test/node-x64.tar.gz',
    NODE_X64_SHA256: sha256(node('x64')),
    MONGO_VERSION: '8.0.0',
    MONGO_ARM64_URL: 'https://mongodb.test/mongo-arm64.tgz',
    MONGO_ARM64_SHA256: sha256(mongo('arm64')),
    MONGO_X64_URL: 'https://mongodb.test/mongo-x64.tgz',
    MONGO_X64_SHA256: sha256(mongo('x64')),
  };
  const lines = Object.entries(pins).map(([key, value]) => `${key}="${value}"`);
  const script = join(dir, 'install.sh');
  writeFileSync(
    script,
    readFileSync(join(ROOT, 'install', 'install.sh'), 'utf8').replace('# __PINS__', () => lines.join('\n')),
  );

  const home = join(dir, 'home');
  const forgeHome = join(home, 'Library', 'Application Support', 'ForgeAcademy');
  const log = join(dir, 'calls.log');
  writeFileSync(log, '');
  const install = (env: Record<string, string> = {}, file = script) =>
    bash(`export PATH="${unix(bin)}:$PATH"; exec bash "${unix(file)}"`, {
      HOME: unix(home),
      FORGE_RELEASE: unix(release),
      FAKE_LOG: unix(log),
      FAKE_ORIGIN: unix(origin),
      FORGE_HOME: '',
      ...env,
    });
  return { dir, home, forgeHome, release, script, install, calls: () => readFileSync(log, 'utf8') };
}

test('a fresh Apple silicon Mac gets everything, with no spaces lost', { skip }, () => {
  const mac = machine('fresh');
  const { status, output } = mac.install();
  assert.equal(status, 0, output);
  assert.ok(mac.calls().includes('node-arm64.tar.gz') && mac.calls().includes('mongo-arm64.tgz'), mac.calls());
  assert.ok(!mac.calls().includes('x64'), mac.calls());
  assert.ok(existsSync(join(mac.forgeHome, 'runtime', 'node', 'bin', 'node')));
  assert.ok(existsSync(join(mac.forgeHome, 'runtime', 'mongodb', 'bin', 'mongod')));
  assert.ok(existsSync(join(mac.forgeHome, 'app', 'scripts', 'app.mjs')));
  assert.ok(existsSync(join(mac.forgeHome, 'data')));
  assert.ok(!existsSync(join(mac.forgeHome, 'app.new')) && !existsSync(join(mac.forgeHome, 'app.old')));
  assert.deepEqual(readdirSync(join(mac.forgeHome, 'downloads')), ['forge-academy-0.2.0.tar.gz']);
  assert.match(mac.calls(), /npm ci --omit=dev .* in app\.new/);
  assert.match(mac.calls(), /node .*\/app\/scripts\/app\.mjs\n$/);
});

test('the Mac app points at the installed copy', { skip }, () => {
  const mac = machine('bundle');
  assert.equal(mac.install().status, 0);
  const contents = join(mac.home, 'Applications', 'Forge Academy.app', 'Contents');
  const launcher = readFileSync(join(contents, 'MacOS', 'Forge Academy'), 'utf8');
  assert.ok(launcher.includes('Application Support/ForgeAcademy/runtime/node/bin/node"'), launcher);
  assert.ok(launcher.includes('Application Support/ForgeAcademy/app/scripts/app.mjs"'), launcher);
  assert.equal(bash(`test -x "${unix(join(contents, 'MacOS', 'Forge Academy'))}"`).status, 0);
  assert.equal(readFileSync(join(contents, 'Resources', 'forge.icns'), 'utf8'), 'icon');
  assert.ok(readFileSync(join(contents, 'Info.plist'), 'utf8').includes('<string>Forge Academy</string>'));
  assert.ok(existsSync(join(mac.home, 'Desktop', 'Forge Academy.app')));
});

test('an Intel Mac gets the Intel downloads', { skip }, () => {
  const mac = machine('intel');
  const { status, output } = mac.install({ FAKE_ARM: '0' });
  assert.equal(status, 0, output);
  assert.ok(mac.calls().includes('node-x64.tar.gz') && mac.calls().includes('mongo-x64.tgz'), mac.calls());
  assert.ok(!mac.calls().includes('arm64'), mac.calls());
});

test('running it again keeps runtimes, stops the app and backs up progress', { skip }, () => {
  const mac = machine('again');
  assert.equal(mac.install().status, 0);
  const progress = join(mac.forgeHome, 'data', 'progress.json');
  writeFileSync(progress, '{"done":1}');
  writeFileSync(join(mac.forgeHome, 'app', 'old-file'), 'from the old release');
  writeFileSync(mac.dir + '/calls.log', '');
  const { status, output } = mac.install();
  assert.equal(status, 0, output);
  assert.ok(!mac.calls().includes('curl'), 'no second download of Node or MongoDB');
  assert.match(mac.calls().split('\n')[0], /app\.mjs stop$/);
  assert.equal(readFileSync(progress, 'utf8'), '{"done":1}');
  const backups = readdirSync(join(mac.forgeHome, 'data', 'backups'));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(mac.forgeHome, 'data', 'backups', backups[0]), 'utf8'), '{"done":1}');
  assert.ok(!existsSync(join(mac.forgeHome, 'app', 'old-file')), 'the old program is replaced');
});

test('a corrupted download is deleted and reported', { skip }, () => {
  const mac = machine('corrupt');
  const { status, output } = mac.install({ FAKE_CORRUPT: '1' });
  assert.equal(status, 1);
  assert.match(output, /didn't match its checksum/);
  assert.ok(!existsSync(join(mac.forgeHome, 'downloads', 'node.tar.gz')));
  assert.ok(!existsSync(join(mac.forgeHome, 'runtime', 'node')));
});

test('a dropped connection resumes on the next run', { skip }, () => {
  const mac = machine('dropped');
  const { status, output } = mac.install({ FAKE_CURL_STATUS: '18' });
  assert.equal(status, 1);
  assert.match(output, /Couldn't download/);
  assert.ok(existsSync(join(mac.forgeHome, 'downloads', 'node.tar.gz.part')));
  assert.equal(mac.install().status, 0);
  assert.match(mac.calls(), /resumed .*node\.tar\.gz\.part/);
});

test('a server that can\'t resume doesn\'t leave the installer stuck', { skip }, () => {
  const mac = machine('no-ranges');
  assert.equal(mac.install({ FAKE_CURL_STATUS: '33' }).status, 1);
  assert.ok(!existsSync(join(mac.forgeHome, 'downloads', 'node.tar.gz.part')));
  assert.equal(mac.install().status, 0);
});

test('an old file with the same name is replaced, not resumed', { skip }, () => {
  const mac = machine('stale');
  assert.equal(mac.install().status, 0);
  const stale = join(mac.forgeHome, 'downloads', 'forge-academy-0.2.0.tar.gz');
  writeFileSync(stale, 'the release before this one');
  const { status, output } = mac.install();
  assert.equal(status, 0, output);
  assert.equal(sha256(stale), sha256(join(mac.release, 'forge-academy-0.2.0.tar.gz')));
});

test('a damaged release leaves the working copy alone', { skip }, () => {
  const mac = machine('damaged');
  assert.equal(mac.install().status, 0);
  const archiveFile = join(mac.release, 'forge-academy-0.2.0.tar.gz');
  rmSync(join(mac.forgeHome, 'downloads', 'forge-academy-0.2.0.tar.gz'));
  writeFileSync(archiveFile, 'not the release');
  const { status, output } = mac.install();
  assert.equal(status, 1);
  assert.match(output, /checksum/);
  assert.ok(existsSync(join(mac.forgeHome, 'app', 'scripts', 'app.mjs')));
});

test('a failed package install leaves the working copy alone', { skip }, () => {
  const mac = machine('offline');
  assert.equal(mac.install().status, 0);
  writeFileSync(join(mac.forgeHome, 'app', 'marker'), 'still here');
  const { status, output } = mac.install({ FAKE_NPM_STATUS: '1' });
  assert.equal(status, 1);
  assert.match(output, /Couldn't install packages/);
  assert.ok(existsSync(join(mac.forgeHome, 'app', 'marker')));
});

test('it refuses a machine it can\'t serve, before touching anything', { skip }, () => {
  const linux = machine('linux');
  const refused = linux.install({ FAKE_UNAME: 'Linux' });
  assert.equal(refused.status, 1);
  assert.match(refused.output, /for Mac/);
  assert.ok(!existsSync(linux.forgeHome));

  const full = machine('full');
  const small = full.install({ FAKE_FREE_KB: '1048576' });
  assert.equal(small.status, 1);
  assert.match(small.output, /needs 2 GB of free space, and this disk has 1 GB/);
  assert.ok(!full.calls().includes('curl'));
});

test('a download cut off halfway runs nothing', { skip }, () => {
  const mac = machine('cut');
  const whole = readFileSync(mac.script, 'utf8');
  const cut = join(mac.dir, 'cut.sh');
  writeFileSync(cut, whole.slice(0, whole.lastIndexOf('\nmain')));
  mac.install({}, cut);
  assert.ok(!existsSync(mac.forgeHome));
  assert.equal(mac.calls(), '');
});
