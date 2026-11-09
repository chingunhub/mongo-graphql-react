import express, { type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadCurriculum,
  taskStart,
  isTaskLocal,
  cumulative,
  type Curriculum,
  type TaskItem,
  type Item,
} from './content.js';
import { getProgress, itemProgress, peekItem, saveProgress, flush } from './progress.js';
import { exportProgress } from './progress-export.js';
import { applyReview, restReview, reviewSession, type ReviewOutcome } from './review.js';
import { runJob, cleanupSandboxDbs, stopPrivateMongo, type Files } from './runner.js';
import { updateStatus } from './update.js';
import {
  startService,
  stopAll,
  serviceInfo,
  proxyGraphQL,
  buildBrowserBundle,
  getBundle,
  previewHtml,
  hasReferenceBoot,
  stageListEntry,
} from './services.js';
import { PORT, ROOT } from './paths.js';
import { isLanguage, type Language } from '../shared/languages.js';
import { workspaceFiles, workspaceStatus, relaydeskLaunch } from './workspaces.js';
import { relaydeskSource } from './relaydesk-source.js';
import { finaleFiles, taskforgeLaunch, taskforgePassedRun, taskforgeSource } from './taskforge-source.js';
import { exportRelaydesk } from './relaydesk-export.js';
import {
  relaydeskInfo,
  startRelaydeskPreview,
  stopRelaydesk,
  stopRelaydesks,
  proxyRelaydesk,
} from './relaydesk.js';

const DEV = process.argv.includes('--dev');
const views = new Map<Language, Curriculum>([['en', loadCurriculum()]]);
/** The course in the learner's language. Item keys, files and tests are the same in each. */
function curriculum() {
  const language = getProgress().settings.language ?? 'en';
  if (DEV || !views.has(language)) views.set(language, loadCurriculum(language));
  return views.get(language)!;
}

const app = express();
app.use(express.json({ limit: '5mb' }));

// ---------- helpers ----------

function getItem(req: Request): Item | undefined {
  return curriculum().byKey.get(`${req.params.mod}/${req.params.item}`);
}

function asTask(req: Request, res: Response): TaskItem | null {
  const item = getItem(req);
  if (!item || item.kind === 'lesson') {
    res.status(404).json({ error: 'No such task' });
    return null;
  }
  return item;
}

/** Read-only paths for a forge step: every provided file declared up to and including this step. */
function readonlyPaths(task: TaskItem): string[] {
  const workspace = task.workspace ?? task.base;
  if (!workspace) return task.readonly;
  const steps = curriculum().workspaces.get(workspace) ?? [];
  const reached = task.base ? steps : steps.slice(0, task.step! + 1);
  return [...new Set([...reached.flatMap((s) => s.readonly), ...task.readonly])];
}

function isLocked(task: TaskItem): boolean {
  if (getProgress().settings.unlockAll) return false;
  if (task.base) return peekItem(curriculum().workspaces.get(task.base)!.at(-1)!.key)?.status !== 'passed';
  if (!task.workspace || task.step === 0) return false;
  const prev = curriculum().workspaces.get(task.workspace)![task.step! - 1];
  return peekItem(prev.key)?.status !== 'passed';
}

/** The learner's finished project with the task's own files laid over it. */
function baseFiles(task: TaskItem): Files {
  const files = taskStart(curriculum(), task);
  const ro = new Set(readonlyPaths(task));
  const ws = getProgress().workspaces[task.base!]?.files ?? {};
  for (const [path, content] of Object.entries(ws)) {
    if (path in files && !ro.has(path) && !(path in task.starter)) files[path] = content;
  }
  return files;
}

function taskFiles(task: TaskItem): Files {
  const saved = peekItem(task.key)?.files ?? {};
  if (task.base) return { ...baseFiles(task), ...saved };
  if (!task.workspace) {
    const files: Files = { ...task.starter };
    for (const p of Object.keys(files)) if (p in saved && !task.readonly.includes(p)) files[p] = saved[p];
    return files;
  }
  const ro = new Set(readonlyPaths(task));
  const files = taskStart(curriculum(), task);
  const ws = getProgress().workspaces[task.workspace]?.files ?? {};
  for (const [p, c] of Object.entries(ws)) if (!ro.has(p) && p in files) files[p] = c;
  // Files the learner created in earlier steps that are no longer in the base are kept too.
  for (const [p, c] of Object.entries(ws)) if (!(p in files)) files[p] = c;
  for (const [p, c] of Object.entries(saved)) if (isTaskLocal(p)) files[p] = c;
  return files;
}

function saveFiles(task: TaskItem, incoming: Files) {
  const current = taskFiles(task);
  const ro = new Set(readonlyPaths(task));
  const ip = itemProgress(task.key);
  if (task.base) {
    // Only what differs from the base, so this task never rewrites the learner's project.
    const base = baseFiles(task);
    const files: Files = {};
    for (const [path, content] of Object.entries(current)) {
      const next = typeof incoming[path] === 'string' ? incoming[path] : content;
      if (!ro.has(path) && next !== base[path]) files[path] = next;
    }
    ip.files = files;
  } else if (!task.workspace) {
    const files: Files = {};
    for (const p of Object.keys(task.starter)) {
      if (ro.has(p)) continue;
      if (typeof incoming[p] === 'string') files[p] = incoming[p];
      else if (ip.files?.[p] !== undefined) files[p] = ip.files[p];
    }
    ip.files = files;
  } else {
    const p = getProgress();
    const ws = (p.workspaces[task.workspace] ??= { files: {}, updatedAt: '' });
    const local: Files = { ...(ip.files ?? {}) };
    for (const [path, content] of Object.entries(incoming)) {
      if (!(path in current) || ro.has(path) || typeof content !== 'string') continue;
      if (isTaskLocal(path)) local[path] = content;
      else ws.files[path] = content;
    }
    // Snapshot every non-local file so the workspace is complete from here on.
    for (const [path, content] of Object.entries(current)) {
      if (!isTaskLocal(path) && !ro.has(path) && !(path in ws.files)) ws.files[path] = content;
    }
    ws.updatedAt = new Date().toISOString();
    ip.files = local;
  }
  saveProgress();
}

function itemSummary(item: Item) {
  if (item.kind === 'lesson') {
    return {
      kind: item.kind,
      key: item.key,
      id: item.id,
      title: item.title,
      minutes: item.minutes,
      done: !!getProgress().lessons[item.key],
    };
  }
  const ip = peekItem(item.key);
  return {
    kind: item.kind,
    key: item.key,
    id: item.id,
    title: item.title,
    summary: item.summary,
    workspace: item.workspace,
    step: item.step,
    status: ip?.status ?? 'new',
    locked: isLocked(item),
  };
}

// ---------- API ----------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, reference: serviceInfo('reference').status });
});

app.get('/api/curriculum', (_req, res) => {
  const c = curriculum();
  const p = getProgress();
  res.json({
    modules: c.modules.map((m) => ({
      id: m.id,
      number: m.number,
      title: m.title,
      part: m.part,
      stage: m.stage,
      summary: m.summary,
      items: m.items.map(itemSummary),
    })),
    lastVisited: p.lastVisited,
    settings: p.settings,
  });
});

app.get('/api/items/:mod/:item', (req, res) => {
  const item = getItem(req);
  if (!item) return void res.status(404).json({ error: 'Not found' });
  const p = getProgress();
  p.lastVisited = item.key;
  saveProgress();
  if (item.kind === 'lesson') {
    return void res.json({ ...itemSummary(item), body: item.body });
  }
  const ip = peekItem(item.key);
  const attempts = ip?.attempts ?? 0;
  res.json({
    ...itemSummary(item),
    env: item.env,
    instructions: item.instructions,
    focus: item.focus,
    readonly: readonlyPaths(item),
    preview: !!item.preview,
    files: taskFiles(item),
    hints: item.hints.slice(0, ip?.hintsShown ?? 0),
    hintCount: item.hints.length,
    needs: item.needs.map((key) => ({ key, title: curriculum().byKey.get(key)?.title ?? key })),
    attempts,
    lastResult: ip?.lastResult,
    solutionAvailable: ip?.status === 'passed' || attempts >= 3,
    solutionRevealed: ip?.solutionRevealed ?? false,
  });
});

app.post('/api/items/:mod/:item/complete', (req, res) => {
  const item = getItem(req);
  if (!item || item.kind !== 'lesson') return void res.status(404).json({ error: 'Not found' });
  getProgress().lessons[item.key] = { doneAt: new Date().toISOString() };
  saveProgress();
  res.json({ ok: true });
});

app.post('/api/items/:mod/:item/save', (req, res) => {
  const task = asTask(req, res);
  if (!task) return;
  saveFiles(task, req.body.files ?? {});
  res.json({ ok: true });
});

app.post('/api/items/:mod/:item/run', async (req, res) => {
  const task = asTask(req, res);
  if (!task) return;
  saveFiles(task, req.body.files ?? {});
  const files = taskFiles(task);
  const entry = Object.keys(files).find(isTaskLocal);
  const out = await runJob({
    mode: 'run',
    files,
    env: 'node',
    db: task.db,
    entry,
  });
  res.json(out);
});

app.post('/api/items/:mod/:item/submit', async (req, res) => {
  const task = asTask(req, res);
  if (!task) return;
  saveFiles(task, req.body.files ?? {});
  const out = await runJob({
    mode: 'test',
    files: taskFiles(task),
    tests: task.tests,
    env: task.env,
    db: task.db,
  });
  const ip = itemProgress(task.key);
  ip.attempts += 1;
  ip.lastResult = {
    passed: out.results.filter((r) => r.passed).length,
    total: out.results.length,
    at: new Date().toISOString(),
  };
  const firstPass = out.ok && ip.status !== 'passed';
  if (out.ok) {
    ip.status = 'passed';
    ip.passedAt ??= new Date().toISOString();
  }
  saveProgress();
  res.json({
    ...out,
    firstPass,
    attempts: ip.attempts,
    solutionAvailable: out.ok || ip.attempts >= 3,
  });
});

app.post('/api/items/:mod/:item/hint', (req, res) => {
  const task = asTask(req, res);
  if (!task) return;
  const ip = itemProgress(task.key);
  ip.hintsShown = Math.min(task.hints.length, ip.hintsShown + 1);
  saveProgress();
  res.json({ hints: task.hints.slice(0, ip.hintsShown) });
});

app.post('/api/items/:mod/:item/solution', (req, res) => {
  const task = asTask(req, res);
  if (!task) return;
  const ip = itemProgress(task.key);
  if (!(ip.status === 'passed' || ip.attempts >= 3)) {
    return void res.status(403).json({ error: 'Make at least 3 attempts first.' });
  }
  ip.solutionRevealed = true;
  saveProgress();
  res.json({ files: task.solution });
});

/** Reset one file to where this step started (starter for drills, reference-so-far for forge steps). */
app.post('/api/items/:mod/:item/reset', (req, res) => {
  const task = asTask(req, res);
  if (!task) return;
  const path = String(req.body.path ?? '');
  const base = task.base ? baseFiles(task) : taskStart(curriculum(), task);
  if (!(path in base)) return void res.status(400).json({ error: 'Unknown file' });
  const ip = itemProgress(task.key);
  if (task.workspace && !isTaskLocal(path)) {
    const ws = getProgress().workspaces[task.workspace];
    if (ws) ws.files[path] = base[path];
  } else if (ip.files) {
    delete ip.files[path];
  }
  saveProgress();
  res.json({ path, content: base[path] });
});

app.post('/api/items/:mod/:item/preview', async (req, res) => {
  const task = asTask(req, res);
  if (!task) return;
  if (!task.preview) return void res.status(400).json({ error: 'This task has no preview' });
  saveFiles(task, req.body.files ?? {});
  const out = await buildBrowserBundle(task.key, taskFiles(task), task.preview);
  res.json({ ...out, url: `/preview/${task.key}/?t=${Date.now()}` });
});

app.get('/preview/:mod/:item/', (req, res) => {
  res.type('html').send(previewHtml(`${req.params.mod}/${req.params.item}`, 'Preview'));
});
app.get('/preview/:mod/:item/bundle.:ext', (req, res) => {
  const b = getBundle(`${req.params.mod}/${req.params.item}`);
  if (req.params.ext === 'css') return void res.type('css').send(b?.css ?? '');
  res.type('js').send(b?.js ?? 'document.body.textContent = "Press Run to build the preview."');
});

app.get('/api/review', (_req, res) => {
  res.json(reviewSession(curriculum(), getProgress()));
});

app.post('/api/review', (req, res) => {
  const { id, outcome } = req.body as { id?: string; outcome?: ReviewOutcome };
  if (!id || !outcome || !applyReview(curriculum(), getProgress(), id, outcome)) {
    return void res.status(400).json({ error: 'Unknown review card' });
  }
  saveProgress();
  res.json({ ok: true });
});

/** Nothing more to review today, whether the session finished or was declined. */
app.post('/api/review/rest', (_req, res) => {
  restReview(getProgress());
  saveProgress();
  res.json({ ok: true });
});

app.put('/api/settings', (req, res) => {
  if ('language' in req.body && !isLanguage(req.body.language)) {
    return void res.status(400).json({ error: 'Unknown language' });
  }
  const p = getProgress();
  p.settings = { ...p.settings, ...req.body };
  saveProgress();
  res.json(p.settings);
});

/** A file the student saves and can choose to send. Nothing leaves this machine on its own. */
app.get('/api/progress/export', (_req, res) => {
  res.attachment(`forge-academy-progress-${new Date().toISOString().slice(0, 10)}.json`);
  res.send(JSON.stringify(exportProgress(curriculum(), getProgress()), null, 2));
});

// ---------- independent Relaydesk workspace ----------
function relaydeskKind(value: unknown): 'mine' | 'reference' {
  if (value !== 'mine' && value !== 'reference') throw Error('Unknown project view');
  return value;
}
app.get('/api/relaydesk', (_req, res) => {
  res.json({
    services: {
      mine: relaydeskInfo('mine'),
      reference: relaydeskInfo('reference'),
    },
    progress: workspaceStatus(curriculum(), getProgress(), 'relaydesk'),
  });
});
app.get('/api/relaydesk/:kind/source', (req, res) => {
  const source = relaydeskSource(curriculum(), getProgress(), relaydeskKind(req.params.kind));
  res.json({ entries: source.entries });
});
app.get('/api/relaydesk/:kind/source/file', (req, res) => {
  const file = typeof req.query.path === 'string' ? req.query.path : '';
  const source = relaydeskSource(curriculum(), getProgress(), relaydeskKind(req.params.kind));
  if (!Object.hasOwn(source.files, file)) return void res.status(404).json({ error: 'No such project file' });
  res.json({ path: file, content: source.files[file] });
});
app.post('/api/relaydesk/:kind/start', async (req, res) => {
  const kind = relaydeskKind(req.params.kind);
  const launch = relaydeskLaunch(curriculum(), getProgress());
  if (kind === 'mine' && !launch.ready)
    return void res.status(409).json({
      error: 'Complete the Relaydesk foundation through Start, integrate and recover before launching.',
    });
  res.json(
    await startRelaydeskPreview(
      kind,
      kind === 'mine' ? launch.files! : workspaceFiles(curriculum(), getProgress(), 'relaydesk', kind),
      req.body?.redis === true,
    ),
  );
});
app.post('/api/relaydesk/:kind/stop', async (req, res) => {
  const kind = relaydeskKind(req.params.kind);
  await stopRelaydesk(kind);
  res.json(relaydeskInfo(kind));
});
app.post('/api/relaydesk/:kind/export', async (req, res) => {
  res.json(await exportRelaydesk(curriculum(), getProgress(), relaydeskKind(req.params.kind)));
});
app.use('/projects/relaydesk/:kind', async (req, res) => {
  await proxyRelaydesk(relaydeskKind(req.params.kind), req, res);
});

// ---------- Taskforge project source ----------
app.get('/api/taskforge/:kind/source', (req, res) => {
  const source = taskforgeSource(curriculum(), getProgress(), relaydeskKind(req.params.kind));
  res.json({ entries: source.entries, passed: source.passed, total: source.total });
});
app.get('/api/taskforge/:kind/source/file', (req, res) => {
  const path = String(req.query.path ?? '');
  const { files } = taskforgeSource(curriculum(), getProgress(), relaydeskKind(req.params.kind));
  if (!Object.hasOwn(files, path)) return void res.status(404).json({ error: 'File not available yet' });
  res.json({ path, content: files[path] });
});

// ---------- reference API + your launched Taskforge ----------

function referenceFiles(): Files | null {
  const steps = curriculum().workspaces.get('taskforge');
  if (!steps?.length || !hasReferenceBoot()) return null;
  return { ...cumulative(curriculum(), 'taskforge', steps.length) };
}

app.post('/reference/graphql', async (req, res) => {
  const r = await proxyGraphQL('reference', req.body, req.get('authorization'));
  res.status(r.status).json(r.json);
});
app.get('/api/reference', (_req, res) =>
  res.json({ ...serviceInfo('reference'), web: !!getBundle('reference-app') }),
);
app.post('/api/reference/restart', async (_req, res) => {
  const files = referenceFiles();
  if (!files) return void res.status(400).json({ error: 'Reference not available' });
  res.json(await startService('reference', files, 'forge_reference', true));
});
// The finished board, talking to the reference API. Lessons share that API, so it only
// restarts (and reseeds) when it isn't running or the learner asks for fresh demo data.
app.post('/api/reference/launch', async (req, res) => {
  const files = referenceFiles();
  if (!files) return void res.status(400).json({ error: 'Reference not available' });
  if (req.body?.reseed || serviceInfo('reference').status !== 'running')
    await startService('reference', files, 'forge_reference', true);
  const entry = [
    "import { createRoot } from 'react-dom/client';",
    "import { App } from './App';",
    "import './styles.css';",
    "createRoot(document.getElementById('root')!).render(<App uri=\"/reference/graphql\" />);",
  ].join('\n');
  const web = await buildBrowserBundle(
    'reference-app',
    { ...files, 'web/__reference__.tsx': entry },
    'web/__reference__.tsx',
  );
  res.json({ server: { ...serviceInfo('reference'), web: !!getBundle('reference-app') }, web });
});
app.get('/reference-app/', (_req, res) =>
  res.type('html').send(previewHtml('reference-app', 'Taskforge reference')),
);
app.get('/reference-app/bundle.:ext', (req, res) => {
  const b = getBundle('reference-app');
  if (req.params.ext === 'css') return void res.type('css').send(b?.css ?? '');
  res.type('js').send(b?.js ?? 'document.body.textContent = "Launch the reference from the course first."');
});

app.post('/mine/graphql', async (req, res) => {
  const r = await proxyGraphQL('mine', req.body, req.get('authorization'));
  res.status(r.status).json(r.json);
});
function launchInfo() {
  return { ...serviceInfo('mine'), ...taskforgeLaunch(curriculum(), getProgress()) };
}
app.get('/api/launch', (_req, res) => res.json(launchInfo()));
app.post('/api/launch', async (req, res) => {
  const { stage } = taskforgeLaunch(curriculum(), getProgress());
  if (!stage) return void res.status(400).json({ error: 'Pass the resolvers step in module 7 to run your API.' });
  const { steps, count } = taskforgePassedRun(curriculum(), getProgress());
  const files = { ...taskFiles(steps[count - 1]), ...finaleFiles(curriculum(), getProgress()) };
  await startService('mine', files, 'taskforge_mine', !!req.body?.reseed, stage.ownBoot ? undefined : stage);
  const web =
    stage.web === 'app'
      ? await buildBrowserBundle('launch', files, 'web/main.tsx')
      : stage.web === 'list'
        ? await buildBrowserBundle(
            'launch',
            { ...files, 'web/__stage__.tsx': stageListEntry() },
            'web/__stage__.tsx',
          )
        : null;
  res.json({ server: launchInfo(), web });
});
app.get('/launch/', (_req, res) => res.type('html').send(previewHtml('launch', 'Taskforge')));
app.get('/launch/bundle.:ext', (req, res) => {
  const b = getBundle('launch');
  if (req.params.ext === 'css') return void res.type('css').send(b?.css ?? '');
  res.type('js').send(b?.js ?? 'document.body.textContent = "Launch Taskforge from the course first."');
});

app.get('/api/update', async (_req, res) => {
  res.json(await updateStatus());
});

app.post('/api/shutdown', (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => shutdown(), 100);
});

// ---------- web UI ----------

async function mountWeb() {
  if (DEV) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: join(ROOT, 'web'),
      configFile: join(ROOT, 'web', 'vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const dist = join(ROOT, 'dist', 'web');
    if (!existsSync(dist)) console.warn('[forge] dist/web missing — run `npm run build`');
    app.use(express.static(dist));
    app.get(/^\/(?!api|preview|launch|reference|mine).*/, (_req, res) =>
      res.sendFile('index.html', { root: dist }),
    );
  }
}

async function shutdown() {
  flush();
  stopAll();
  await stopRelaydesks();
  await stopPrivateMongo();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await cleanupSandboxDbs();
await mountWeb();
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[forge] Forge Academy on http://localhost:${PORT}${DEV ? ' (dev)' : ''}`);
});
const ref = referenceFiles();
if (ref) {
  startService('reference', ref, 'forge_reference', true).then((s) =>
    console.log(`[forge] reference API: ${s.status}`),
  );
}
