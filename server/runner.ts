import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import mongoose from 'mongoose';
import { ROOT, MONGO_BASE, SANDBOX_PREFIX } from './paths.js';

export type Files = Record<string, string>;

export interface LogLine {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  test?: string;
}
export interface TestResult {
  name: string;
  passed: boolean;
  ms: number;
  message?: string;
  stack?: string;
  hint?: string;
}
export interface CompileError {
  file: string;
  line: number;
  column: number;
  text: string;
  lineText?: string;
}
export interface RunOutput {
  mode: 'run' | 'test';
  ok: boolean;
  logs: LogLine[];
  results: TestResult[];
  compileErrors?: CompileError[];
  crashed?: { phase: string; message: string; stack?: string } | null;
  timedOut?: boolean;
  ms: number;
}

export interface RunRequest {
  mode: 'run' | 'test';
  files: Files;
  tests?: Files;
  env: 'node' | 'dom';
  db: boolean;
  entry?: string;
  timeoutMs?: number;
}

const RUNS = join(ROOT, '.runs');
const HARNESS = join(ROOT, 'sandbox', 'harness.mjs');
const KIT_URL = pathToFileURL(join(ROOT, 'sandbox', 'kit.mjs')).href;

export function safePath(p: string): string {
  const n = normalize(p).replace(/\\/g, '/');
  if (n.startsWith('..') || n.startsWith('/') || /^[a-zA-Z]:/.test(n)) throw new Error(`Bad path: ${p}`);
  return n;
}

export async function writeTree(dir: string, files: Files) {
  for (const [p, content] of Object.entries(files)) {
    const full = join(dir, safePath(p));
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
}

const FAKE_TASKFORGE = join(ROOT, 'content', '_shared', 'fakeTaskforge.ts');

const kitPlugin: esbuild.Plugin = {
  name: 'forge-kit',
  setup(build) {
    build.onResolve({ filter: /^@forge\/kit$/ }, () => ({ path: KIT_URL, external: true }));
    // Shared test fixture (bundled, not external): an in-memory Taskforge API for React tests.
    build.onResolve({ filter: /^@forge\/fake-taskforge$/ }, () => ({ path: FAKE_TASKFORGE }));
  },
};

function toCompileErrors(err: unknown): CompileError[] | null {
  const e = err as { errors?: esbuild.Message[] };
  if (!e?.errors?.length) return null;
  return e.errors.map((m) => ({
    file: (m.location?.file ?? '').replace(/\\/g, '/'),
    line: m.location?.line ?? 0,
    column: m.location?.column ?? 0,
    text: m.text,
    lineText: m.location?.lineText,
  }));
}

export async function bundleNode(runDir: string, entry: string, outName: string) {
  const outfile = join(runDir, '__out', outName + '.mjs');
  await esbuild.build({
    absWorkingDir: runDir,
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    jsx: 'automatic',
    sourcemap: 'inline',
    outfile,
    logLevel: 'silent',
    plugins: [kitPlugin],
  });
  return outfile;
}

export async function runJob(req: RunRequest): Promise<RunOutput> {
  const started = Date.now();
  const id = Date.now().toString(36) + randomBytes(3).toString('hex');
  const runDir = join(RUNS, id);
  const base: RunOutput = { mode: req.mode, ok: false, logs: [], results: [], ms: 0 };
  await mkdir(runDir, { recursive: true });

  try {
    await writeTree(runDir, req.files);
    let entry: string;
    if (req.mode === 'test') {
      const testFiles = Object.fromEntries(
        Object.entries(req.tests ?? {}).map(([p, c]) => [`__tests__/${p}`, c]),
      );
      await writeTree(runDir, testFiles);
      entry = Object.keys(testFiles).find((p) => /task\.test\.tsx?$/.test(p)) ?? '';
      if (!entry) throw new Error('Task has no tests/task.test.ts');
    } else {
      entry = req.entry ?? 'playground.ts';
      if (!(entry in req.files)) {
        return { ...base, ms: Date.now() - started, crashed: { phase: 'load', message: `No ${entry} to run.` } };
      }
    }

    let bundle: string;
    try {
      bundle = await bundleNode(runDir, entry, 'entry');
    } catch (err) {
      const compileErrors = toCompileErrors(err);
      if (compileErrors) {
        // Errors inside hidden tests usually mean a missing export in learner code.
        for (const ce of compileErrors) {
          if (ce.file.startsWith('__tests__/')) {
            ce.file = '(hidden tests)';
            ce.lineText = undefined;
          }
        }
        return { ...base, compileErrors, ms: Date.now() - started };
      }
      throw err;
    }

    const dbName = `${SANDBOX_PREFIX}${id}`;
    const job = {
      mode: req.mode,
      bundle,
      runDir,
      env: req.env,
      mongoUri: req.db ? `${MONGO_BASE}/${dbName}` : undefined,
    };
    const jobPath = join(runDir, 'job.json');
    await writeFile(jobPath, JSON.stringify(job));

    const out = await new Promise<RunOutput>((resolve) => {
      const child = fork(HARNESS, [jobPath], {
        cwd: runDir,
        windowsHide: true,
        execArgv: ['--enable-source-maps', '--max-old-space-size=512', '--no-warnings'],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, NODE_ENV: 'test', FORCE_COLOR: '0' },
      });
      const extra: LogLine[] = [];
      child.stdout?.on('data', (d) => extra.push({ level: 'log', text: String(d).trimEnd() }));
      child.stderr?.on('data', (d) => extra.push({ level: 'error', text: String(d).trimEnd() }));
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        resolve({
          ...base,
          logs: extra,
          timedOut: true,
          crashed: {
            phase: 'timeout',
            message: `Stopped after ${(req.timeoutMs ?? 30000) / 1000}s. An infinite loop, or a promise that never resolves?`,
          },
          ms: Date.now() - started,
        });
        if (job.mongoUri) void dropDb(dbName);
      }, req.timeoutMs ?? 30000);

      child.on('message', (msg: { type: string; out: Omit<RunOutput, 'ok' | 'ms'> }) => {
        if (msg?.type !== 'done' || settled) return;
        settled = true;
        clearTimeout(timer);
        const o = msg.out;
        const results = o.results ?? [];
        resolve({
          ...base,
          ...o,
          logs: [...(o.logs ?? []), ...extra.filter((l) => l.text && !/ExperimentalWarning/.test(l.text))],
          ok: !o.crashed && (req.mode === 'run' || (results.length > 0 && results.every((r) => r.passed))),
          ms: Date.now() - started,
        });
      });
      child.on('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          ...base,
          logs: extra,
          crashed: { phase: 'exit', message: `The sandbox process exited unexpectedly (code ${code}).` },
          ms: Date.now() - started,
        });
      });
    });
    return out;
  } catch (err) {
    return {
      ...base,
      crashed: { phase: 'platform', message: (err as Error).message },
      ms: Date.now() - started,
    };
  } finally {
    if (!process.env.FORGE_KEEP_RUNS) rm(runDir, { recursive: true, force: true }).catch(() => {});
  }
}

let admin: mongoose.Connection | null = null;
async function adminConn() {
  if (!admin) admin = await mongoose.createConnection(`${MONGO_BASE}/admin`).asPromise();
  return admin;
}

async function dropDb(name: string) {
  try {
    const conn = await adminConn();
    await conn.useDb(name).dropDatabase();
  } catch {
    /* ignore */
  }
}

/** Drop leftover sandbox databases from crashed runs. */
export async function cleanupSandboxDbs() {
  try {
    const conn = await adminConn();
    const { databases } = await conn.db!.admin().listDatabases();
    await Promise.all(
      databases.filter((d) => d.name.startsWith(SANDBOX_PREFIX)).map((d) => conn.useDb(d.name).dropDatabase()),
    );
  } catch (err) {
    console.warn('[forge] could not clean sandbox DBs:', (err as Error).message);
  }
  await rm(RUNS, { recursive: true, force: true }).catch(() => {});
}

/** The launcher's private mongod belongs to this server, so it stops when the server does. */
export async function stopPrivateMongo() {
  if (!process.env.FORGE_PRIVATE_MONGO) return;
  const stopped = adminConn()
    .then((conn) => conn.db!.admin().command({ shutdown: 1 }))
    .catch(() => {}); // mongod drops the connection as it stops
  await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 3000))]);
}
