import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.js';

export function isNewer(candidate: string, current: string) {
  const parts = (version: string) => version.split('.').map(Number);
  const [a, b] = [parts(candidate), parts(current)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** Whether an installed copy has a newer release. A checkout, or a failed check, simply reports nothing. */
export async function updateStatus(root = ROOT, platform: string = process.platform) {
  const none = { current: null, latest: null, command: null };
  const file = join(root, 'installed.json');
  if (!existsSync(file)) return none;
  const installed = JSON.parse(readFileSync(file, 'utf8')) as { version: string; release: string };
  const release = process.env.FORGE_RELEASE ?? installed.release;
  if (!/^https?:/.test(release)) return { ...none, current: installed.version };
  try {
    const response = await fetch(release + '/manifest.json', { signal: AbortSignal.timeout(3000) });
    const { version } = (await response.json()) as { version: string };
    if (!isNewer(version, installed.version)) return { ...none, current: installed.version };
    const command =
      platform === 'win32' ? `irm ${release}/install.ps1 | iex` : `curl -fsSL ${release}/install.sh | bash`;
    return { current: installed.version, latest: version, command };
  } catch {
    return { ...none, current: installed.version };
  }
}
