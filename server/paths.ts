import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_DIR = join(ROOT, 'content');
// An installed copy keeps student data outside the program folder, so updates can't touch it.
export const DATA_DIR = process.env.FORGE_DATA ?? join(ROOT, 'data');
// Git worktrees have a .git file. Previewing an expansion must never reseed the active course.
export const IS_WORKTREE = existsSync(join(ROOT, '.git')) && statSync(join(ROOT, '.git')).isFile();
export const INSTANCE = IS_WORKTREE
  ? 'forge_w_' + createHash('sha256').update(ROOT).digest('hex').slice(0, 10) + '_'
  : '';
export const SANDBOX_PREFIX = INSTANCE + 'sandbox_';
export const databaseName = (name: string) => INSTANCE + name;
export const MONGO_BASE = process.env.FORGE_MONGO ?? 'mongodb://127.0.0.1:27017';
export const PORT = Number(process.env.FORGE_PORT ?? (IS_WORKTREE ? 4510 : 4500));
export const REFERENCE_PORT = Number(process.env.FORGE_REFERENCE_PORT ?? (IS_WORKTREE ? 4610 : 4600));
export const LAUNCH_PORT = Number(process.env.FORGE_LAUNCH_PORT ?? (IS_WORKTREE ? 4710 : 4700));
