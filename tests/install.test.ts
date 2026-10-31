import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isInstalled, mongoPlan, useInstallLayout } from '../scripts/app-lib.mjs';
import { isNewer, updateStatus } from '../server/update.js';

const ROOT = join(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'install', 'manifest.json'), 'utf8'));

function installedCopy(release = 'https://example.test/forge') {
  const home = mkdtempSync(join(tmpdir(), 'forge-install-'));
  const root = join(home, 'app');
  mkdirSync(root);
  writeFileSync(join(root, 'installed.json'), JSON.stringify({ version: '0.1.0', release }));
  return { home, root };
}

test('every platform pins an official download by checksum', () => {
  for (const pin of [manifest.node, manifest.mongodb]) {
    assert.match(pin.version, /^\d+\.\d+\.\d+$/);
    for (const platform of ['win-x64', 'darwin-arm64', 'darwin-x64']) {
      assert.match(pin[platform].url, /^https:\/\/(nodejs\.org|fastdl\.mongodb\.org)\//);
      assert.ok(pin[platform].url.includes(pin.version), pin[platform].url);
      assert.match(pin[platform].sha256, /^[0-9a-f]{64}$/);
    }
  }
});

test('a checkout is left alone, so a developer keeps their data and their MongoDB', () => {
  const env: Record<string, string> = {};
  useInstallLayout({ root: mkdtempSync(join(tmpdir(), 'forge-checkout-')), env });
  assert.deepEqual(env, {});
});

test('an installed copy keeps data and MongoDB outside the folder that updates replace', () => {
  const { home, root } = installedCopy();
  const env: Record<string, string> = {};
  useInstallLayout({ root, env, platform: 'win32' });
  assert.ok(isInstalled(root));
  assert.equal(env.FORGE_DATA, join(home, 'data'));
  assert.equal(env.FORGE_MONGOD, join(home, 'runtime', 'mongodb', 'bin', 'mongod.exe'));
  const plan = mongoPlan({ env, root, exists: () => true });
  assert.equal(plan.kind, 'private');
  assert.equal(plan.binary, env.FORGE_MONGOD);
  rmSync(home, { recursive: true });
});

test('settings given by hand beat the installed layout', () => {
  const { home, root } = installedCopy();
  const env = { FORGE_DATA: 'custom', FORGE_MONGOD: 'custom-mongod' };
  useInstallLayout({ root, env });
  assert.deepEqual(env, { FORGE_DATA: 'custom', FORGE_MONGOD: 'custom-mongod' });
  rmSync(home, { recursive: true });
});

test('versions compare as numbers, not text', () => {
  assert.ok(isNewer('0.10.0', '0.9.0'));
  assert.ok(isNewer('1.0.0', '0.9.9'));
  assert.ok(isNewer('0.1.1', '0.1.0'));
  assert.ok(!isNewer('0.1.0', '0.1.0'));
  assert.ok(!isNewer('0.9.0', '0.10.0'));
});

test('a checkout never reports an update', async () => {
  const root = mkdtempSync(join(tmpdir(), 'forge-checkout-'));
  assert.deepEqual(await updateStatus(root), { current: null, latest: null, command: null });
});

async function withRelease(reply: () => Promise<Response>, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = reply as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('an installed copy gets the line for its own system when a newer release exists', async () => {
  const { home, root } = installedCopy();
  await withRelease(
    async () => Response.json({ version: '0.2.0' }),
    async () => {
      const windows = await updateStatus(root, 'win32');
      assert.equal(windows.latest, '0.2.0');
      assert.equal(windows.command, 'irm https://example.test/forge/install.ps1 | iex');
      const mac = await updateStatus(root, 'darwin');
      assert.equal(mac.command, 'curl -fsSL https://example.test/forge/install.sh | bash');
    },
  );
  rmSync(home, { recursive: true });
});

test('being offline, or already current, shows nothing', async () => {
  const { home, root } = installedCopy();
  await withRelease(
    async () => {
      throw Error('offline');
    },
    async () => assert.deepEqual(await updateStatus(root), { current: '0.1.0', latest: null, command: null }),
  );
  await withRelease(
    async () => Response.json({ version: '0.1.0' }),
    async () => assert.equal((await updateStatus(root)).latest, null),
  );
  rmSync(home, { recursive: true });
});

test('a copy installed from a folder has nowhere to check', async () => {
  const { home, root } = installedCopy('');
  assert.equal((await updateStatus(root)).latest, null);
  assert.ok(existsSync(join(root, 'installed.json')));
  rmSync(home, { recursive: true });
});
