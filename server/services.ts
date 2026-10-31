// Long-running child servers:
//  - the *reference* Taskforge API (course solution, seeded DB) used by lessons and React previews
//  - *your* Taskforge (finale "Launch"), built from your workspace files
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { ROOT, MONGO_BASE, REFERENCE_PORT, LAUNCH_PORT, CONTENT_DIR, databaseName } from './paths.js';
import { bundleNode, writeTree, type Files } from './runner.js';
import { readFileSync, existsSync } from 'node:fs';

interface Svc {
  name: string;
  port: number;
  proc: ChildProcess | null;
  status: 'stopped' | 'starting' | 'running' | 'crashed';
  log: string[];
}

const services: Record<string, Svc> = {
  reference: { name: 'reference', port: REFERENCE_PORT, proc: null, status: 'stopped', log: [] },
  mine: { name: 'mine', port: LAUNCH_PORT, proc: null, status: 'stopped', log: [] },
};

export function serviceInfo(name: 'reference' | 'mine') {
  const s = services[name];
  return { status: s.status, port: s.port, log: s.log.slice(-80) };
}

function readRefFile(name: string) {
  return readFileSync(join(CONTENT_DIR, '_reference', name), 'utf8');
}

/** The boot script prints "[boot] ready" once it's listening and seeded. */
async function waitForReady(svc: Svc, proc: ChildProcess, ms = 45000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (svc.proc !== proc) return false; // exited or replaced
    if (svc.log.some((l) => l.includes('[boot] ready'))) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/**
 * Bundle a server workspace + a boot file and run it as a child process.
 * The boot file imports `./server/index` (startServer) and `./__boot__/seed`.
 */
export async function startService(
  name: 'reference' | 'mine',
  files: Files,
  dbName: string,
  reseed: boolean,
  stage?: { auth: boolean },
) {
  const svc = services[name];
  await stopService(name);
  svc.status = 'starting';
  svc.log = [];
  const dir = join(ROOT, '.runs', `svc-${name}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const boot: Files = {
    '__boot__/main.ts': readRefFile(stage ? 'boot-stage.ts' : 'boot.ts'),
    '__boot__/seed.ts': readRefFile('seed.ts'),
    ...(stage && {
      '__boot__/stage-context.ts': readRefFile(stage.auth ? 'stage-context-auth.ts' : 'stage-context-open.ts'),
    }),
  };
  await writeTree(dir, { ...files, ...boot });
  let bundle: string;
  try {
    bundle = await bundleNode(dir, '__boot__/main.ts', 'server');
  } catch (err) {
    svc.status = 'crashed';
    const e = err as { errors?: esbuild.Message[]; message: string };
    svc.log.push(
      ...(e.errors?.map((m) => `Compile error ${m.location?.file}:${m.location?.line} ${m.text}`) ?? [e.message]),
    );
    return serviceInfo(name);
  }
  const proc = spawn(process.execPath, ['--enable-source-maps', '--no-warnings', bundle], {
    cwd: dir,
    env: {
      ...process.env,
      PORT: String(svc.port),
      MONGO_URI: `${MONGO_BASE}/${databaseName(dbName)}`,
      RESEED: reseed ? '1' : '',
      TOKEN_SECRET: 'forge-academy-local-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  svc.proc = proc;
  const push = (d: Buffer) => {
    for (const line of String(d).split(/\r?\n/)) if (line.trim()) svc.log.push(line);
    if (svc.log.length > 400) svc.log.splice(0, svc.log.length - 400);
  };
  proc.stdout?.on('data', push);
  proc.stderr?.on('data', push);
  proc.on('exit', (code) => {
    if (svc.proc === proc) {
      svc.proc = null;
      svc.status = code === 0 ? 'stopped' : 'crashed';
      svc.log.push(`[process exited with code ${code}]`);
    }
  });
  const ok = await waitForReady(svc, proc);
  if (svc.proc === proc) {
    svc.status = ok ? 'running' : 'crashed';
    if (!ok) {
      svc.log.push('[server did not report ready within 45s]');
      proc.kill();
    }
  }
  return serviceInfo(name);
}

export async function stopService(name: 'reference' | 'mine') {
  const svc = services[name];
  const proc = svc.proc;
  if (!proc) return;
  svc.proc = null;
  svc.status = 'stopped';
  await new Promise<void>((resolve) => {
    proc.once('exit', () => resolve());
    proc.kill();
    setTimeout(resolve, 2000);
  });
}

export function stopAll() {
  for (const s of Object.values(services)) s.proc?.kill();
}

/** Forward a GraphQL request to a running child service. */
export async function proxyGraphQL(name: 'reference' | 'mine', body: unknown, auth?: string) {
  const svc = services[name];
  if (svc.status !== 'running') {
    return {
      status: 503,
      json: { errors: [{ message: `The ${name === 'reference' ? 'reference' : 'Taskforge'} server is ${svc.status}.` }] },
    };
  }
  const r = await fetch(`http://127.0.0.1:${svc.port}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
}

// ---------- browser bundles (previews and the launched web app) ----------

const bundles = new Map<string, { js: string; css: string }>();

export async function buildBrowserBundle(key: string, files: Files, entry: string) {
  const dir = join(ROOT, '.runs', 'web-' + key.replace(/[^a-z0-9-]/gi, '_'));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeTree(dir, files);
  try {
    const result = await esbuild.build({
      absWorkingDir: dir,
      entryPoints: [entry],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      jsx: 'automatic',
      write: false,
      outdir: join(dir, 'out'),
      sourcemap: 'inline',
      define: { 'process.env.NODE_ENV': '"development"' },
      logLevel: 'silent',
    });
    const js = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
    const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
    bundles.set(key, { js, css });
    return { ok: true as const };
  } catch (err) {
    const e = err as { errors?: esbuild.Message[]; message: string };
    return {
      ok: false as const,
      compileErrors: (e.errors ?? []).map((m) => ({
        file: (m.location?.file ?? '').replace(/\\/g, '/'),
        line: m.location?.line ?? 0,
        column: m.location?.column ?? 0,
        text: m.text,
        lineText: m.location?.lineText,
      })),
    };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export function getBundle(key: string) {
  return bundles.get(key);
}

export function previewHtml(key: string, title: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="./bundle.css">
<style>
  :root { color-scheme: light dark; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  body { margin: 0; padding: 16px; }
  .preview-error { white-space: pre-wrap; color: #c0392b; font: 13px ui-monospace, monospace; }
</style></head>
<body><div id="root"></div>
<script>
  window.addEventListener('error', (e) => {
    const el = document.createElement('pre'); el.className = 'preview-error';
    el.textContent = 'Runtime error: ' + (e.error?.stack || e.message); document.body.prepend(el);
  });
</script>
<script type="module" src="./bundle.js"></script></body></html>`;
}

export function stageListEntry() {
  return readRefFile('stage-list.tsx');
}

export function hasReferenceBoot() {
  return existsSync(join(CONTENT_DIR, '_reference', 'boot.ts'));
}
