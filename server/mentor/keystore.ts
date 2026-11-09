// Where a remembered key lives. Off by default: without "Remember on this computer" the key
// stays in server memory and is gone when the app stops.
//
// Windows: DPAPI, the same lock Chrome and Edge use for saved passwords. Only this Windows
//   account on this computer can unlock the file. The file is data/mentor/<provider>.key.bin.
// Mac: the login Keychain, under the service name "forge-academy-mentor".
// Other systems: no remembering.
//
// The key goes to PowerShell or `security` on stdin, never on a command line, where other
// programs could read it from the process list.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../paths.js';

export type KeystoreKind = 'dpapi' | 'keychain' | 'none';

export interface Keystore {
  kind: KeystoreKind;
  /** Where the learner can look for it, in words. */
  where: string;
  save(account: string, key: string): Promise<void>;
  load(account: string): Promise<string | null>;
  remove(account: string): Promise<void>;
}

function run(cmd: string, args: string[], input: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.setEncoding('utf8').on('data', (d) => (out += d));
    p.stderr.setEncoding('utf8').on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code: code ?? 1, out, err }));
    p.stdin.end(input);
  });
}

const ACCOUNT = /^[a-z]+$/;
const check = (account: string) => {
  if (!ACCOUNT.test(account)) throw new Error('Bad keystore account.');
};

// ---- Windows ----

/** Not secret: it only keeps other programs' DPAPI blobs from being mistaken for ours. */
const ENTROPY = 'forge-academy-mentor-v1';

/** Reads one base64 line from stdin, writes the result as base64. */
const dpapiScript = (verb: 'Protect' | 'Unprotect') =>
  [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Security',
    '$in=[Convert]::FromBase64String([Console]::In.ReadLine())',
    `$e=[Text.Encoding]::UTF8.GetBytes('${ENTROPY}')`,
    `$o=[Security.Cryptography.ProtectedData]::${verb}($in,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    '[Console]::Out.Write([Convert]::ToBase64String($o))',
  ].join(';');

async function dpapi(verb: 'Protect' | 'Unprotect', data: Buffer): Promise<Buffer> {
  const r = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', dpapiScript(verb)],
    data.toString('base64') + '\n',
  );
  if (r.code !== 0) throw new Error(`Windows couldn't ${verb === 'Protect' ? 'lock' : 'unlock'} the key.`);
  return Buffer.from(r.out.trim(), 'base64');
}

const keyFile = (account: string) => join(DATA_DIR, 'mentor', `${account}.key.bin`);

const windowsStore: Keystore = {
  kind: 'dpapi',
  where: 'data/mentor, locked to this Windows account',
  async save(account, key) {
    check(account);
    const blob = await dpapi('Protect', Buffer.from(key, 'utf8'));
    mkdirSync(join(DATA_DIR, 'mentor'), { recursive: true });
    writeFileSync(keyFile(account), blob, { mode: 0o600 });
  },
  async load(account) {
    check(account);
    let blob: Buffer;
    try {
      blob = readFileSync(keyFile(account));
    } catch {
      return null;
    }
    return (await dpapi('Unprotect', blob)).toString('utf8');
  },
  async remove(account) {
    check(account);
    rmSync(keyFile(account), { force: true });
  },
};

// ---- Mac ----

const SERVICE = 'forge-academy-mentor';
/** The password goes in base64 so no quote or space in it can break the `security -i` line. */
const PREFIX = 'forge-b64:';

const macStore: Keystore = {
  kind: 'keychain',
  where: 'the login Keychain, as "forge-academy-mentor"',
  async save(account, key) {
    check(account);
    const secret = PREFIX + Buffer.from(key, 'utf8').toString('base64');
    // -U updates an existing entry. `security -i` reads the command from stdin.
    const r = await run('security', ['-i'], `add-generic-password -U -s ${SERVICE} -a ${account} -w ${secret}\n`);
    if (r.code !== 0 || /error/i.test(r.err)) throw new Error("The Keychain didn't take the key.");
  },
  async load(account) {
    check(account);
    const r = await run('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w'], '');
    if (r.code !== 0) return null;
    const secret = r.out.trim();
    return secret.startsWith(PREFIX) ? Buffer.from(secret.slice(PREFIX.length), 'base64').toString('utf8') : null;
  },
  async remove(account) {
    check(account);
    await run('security', ['delete-generic-password', '-s', SERVICE, '-a', account], '');
  },
};

const noStore: Keystore = {
  kind: 'none',
  where: 'nowhere: this system has no supported key store',
  async save() {
    throw new Error("This computer can't remember keys. The key stays in memory until the app stops.");
  },
  async load() {
    return null;
  },
  async remove() {},
};

export const keystore: Keystore =
  process.platform === 'win32' ? windowsStore : process.platform === 'darwin' ? macStore : noStore;
