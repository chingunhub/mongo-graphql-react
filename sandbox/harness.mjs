// Runs inside a child process. Executes one bundled job (a playground script or a test file)
// and reports logs + results back to the platform over IPC.
//
// Job (JSON file passed as argv[2]):
//   { mode: 'run' | 'test', bundle: string, runDir: string, env: 'node' | 'dom', mongoUri?: string }

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inspect } from 'node:util';

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const runDirPattern = new RegExp(
  escapeRegExp(job.runDir.replace(/\\/g, '/')) + '/?|' + escapeRegExp(job.runDir) + '\\\\?',
  'g',
);

const logs = [];
const MAX_LOGS = 400;
let currentTest = null;

// ---------- console capture ----------
const realConsole = { ...console };
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => record(level, args);
}
console.table = (data) => record('log', [data]);
console.dir = (obj) => record('log', [obj]);

function record(level, args) {
  if (logs.length >= MAX_LOGS) {
    if (logs.length === MAX_LOGS) logs.push({ level: 'warn', text: '… output truncated (too many logs)' });
    return;
  }
  const text = args
    .map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 5, colors: false, breakLength: 100 })))
    .join(' ');
  logs.push({ level, text: cleanText(text), test: currentTest ?? undefined });
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ANSI = /\u001b\[[0-9;]*m/g;
function cleanText(s) {
  return String(s).replace(ANSI, '').replace(runDirPattern, '').replace(/file:\/\/\/?/g, '');
}

function formatError(err) {
  if (!err) return 'Unknown error';
  if (typeof err !== 'object') return String(err);
  let msg = err.message ?? String(err);
  // Mongoose ValidationError: list each path, it's the most useful thing to see.
  if (err.name === 'ValidationError' && err.errors) {
    msg += '\n' + Object.values(err.errors).map((e) => `  • ${e.path}: ${e.message}`).join('\n');
  }
  return cleanText(msg);
}

function userStack(err) {
  if (!err?.stack) return undefined;
  const lines = String(err.stack)
    .split('\n')
    .filter((l) => /^\s*at /.test(l))
    .filter((l) => !/node_modules|node:internal|harness\.mjs|kit\.mjs/.test(l))
    .map((l) => cleanText(l.trim()))
    .filter((l) => !l.includes('__tests__'))
    .slice(0, 4);
  return lines.length ? lines.join('\n') : undefined;
}

// ---------- tiny test runner ----------
const tests = [];
const hooks = { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] };
let describePrefix = '';

globalThis.test = (name, fn, opts = {}) => {
  tests.push({ name: describePrefix + name, fn, hint: opts.hint, timeout: opts.timeout ?? 8000 });
};
globalThis.it = globalThis.test;
globalThis.describe = (name, fn) => {
  const prev = describePrefix;
  describePrefix = prev + name + ' › ';
  fn();
  describePrefix = prev;
};
for (const k of Object.keys(hooks)) globalThis[k] = (fn) => hooks[k].push(fn);

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} took longer than ${ms / 1000}s. Is something not awaited, or never resolving?`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

async function runTests() {
  const results = [];
  for (const h of hooks.beforeAll) await withTimeout(Promise.resolve().then(h), 15000, 'Test setup');
  for (const t of tests) {
    const started = Date.now();
    currentTest = t.name;
    try {
      for (const h of hooks.beforeEach) await h();
      await withTimeout(Promise.resolve().then(t.fn), t.timeout, 'This test');
      results.push({ name: t.name, passed: true, ms: Date.now() - started });
    } catch (err) {
      results.push({
        name: t.name,
        passed: false,
        ms: Date.now() - started,
        message: formatError(err),
        stack: userStack(err),
        hint: t.hint,
      });
    } finally {
      try {
        for (const h of hooks.afterEach) await h();
      } catch (err) {
        realConsole.error('afterEach failed', err);
      }
    }
  }
  currentTest = null;
  for (const h of hooks.afterAll) {
    try {
      await h();
    } catch {
      /* ignore */
    }
  }
  return results;
}

// ---------- environment ----------
async function setupEnv() {
  if (job.env === 'dom') {
    const { default: globalJsdom } = await import('global-jsdom');
    globalJsdom('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // jsdom doesn't implement these; Apollo/React occasionally touch them.
    window.scrollTo = () => {};
    // React logs act() warnings through console.error; keep them out of learner output.
    const origError = console.error;
    console.error = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('not wrapped in act(')) return;
      origError(...args);
    };
  }
  if (job.mongoUri) {
    const { default: mongoose } = await import('mongoose');
    mongoose.set('strictQuery', true);
    await mongoose.connect(job.mongoUri, { serverSelectionTimeoutMS: 4000 });
    globalThis.__FORGE_DB__ = mongoose;
  }
}

async function teardownEnv() {
  if (job.mongoUri && globalThis.__FORGE_DB__) {
    const mongoose = globalThis.__FORGE_DB__;
    try {
      await mongoose.connection.dropDatabase();
    } catch {
      /* ignore */
    }
    await mongoose.disconnect().catch(() => {});
  }
}

// ---------- main ----------
let unhandled = [];
process.on('unhandledRejection', (err) => {
  unhandled.push(formatError(err));
  record('error', ['Unhandled promise rejection: ' + formatError(err)]);
});

async function main() {
  const out = { mode: job.mode, logs, results: [], crashed: null };
  try {
    await setupEnv();
  } catch (err) {
    out.crashed = {
      phase: 'setup',
      message:
        'Could not prepare the sandbox: ' +
        formatError(err) +
        (job.mongoUri ? '\nIs MongoDB running on 127.0.0.1:27017?' : ''),
    };
    return out;
  }

  try {
    await import(pathToFileURL(job.bundle).href);
  } catch (err) {
    out.crashed = {
      phase: 'load',
      message: formatError(err),
      stack: userStack(err),
    };
  }

  if (job.mode === 'test' && !out.crashed) {
    try {
      out.results = await runTests();
    } catch (err) {
      out.crashed = { phase: 'setup', message: formatError(err), stack: userStack(err) };
    }
  }

  // let pending logs / microtasks settle a little
  await new Promise((r) => setTimeout(r, 20));
  if (job.env === 'dom') {
    try {
      const rtl = await import('@testing-library/react');
      rtl.cleanup();
    } catch {
      /* ignore */
    }
  }
  await teardownEnv();
  return out;
}

main()
  .then((out) => {
    process.send?.({ type: 'done', out }, () => process.exit(0));
    if (!process.send) {
      realConsole.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
  })
  .catch((err) => {
    process.send?.({ type: 'done', out: { logs, results: [], crashed: { phase: 'harness', message: String(err) } } }, () =>
      process.exit(1),
    );
  });
