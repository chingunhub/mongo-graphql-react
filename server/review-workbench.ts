import type { Express, Request, Response } from 'express';
import { taskStart, isTaskLocal, type Curriculum, type TaskItem } from './content.js';
import { getProgress, saveProgress, flush, solutionAvailable, type Progress, type ReviewAttempt } from './progress.js';
import { applyReview, reviewPool } from './review.js';
import { runJob, type Files, type RunOutput } from './runner.js';
import { createSaveOrder } from './save-order.js';
import { buildBrowserBundle, getBundle, previewHtml } from './services.js';

export function reviewAttempt(cur: Curriculum, p: Progress, task: TaskItem, now = new Date()): ReviewAttempt {
  if (task.kind !== 'drill' || p.items[task.key]?.status !== 'passed')
    throw new Error('Only a previously passed drill can be reviewed.');
  const card = reviewPool(cur, p).find((c) => c.id === 'drill:' + task.key);
  const attempts = (p.review.attempts ??= {});
  const old = attempts[task.key];
  if (old && (!card || new Date(card.due) > now || old.cycle === card.due)) return old;
  if (!card || new Date(card.due) > now) throw new Error('This drill is not due for review yet.');
  return (attempts[task.key] = {
    cycle: card.due,
    files: taskStart(cur, task),
    status: 'started',
    attempts: 0,
    hintsShown: 0,
    solutionRevealed: false,
  });
}

export function gradeReview(
  cur: Curriculum,
  p: Progress,
  task: TaskItem,
  attempt: ReviewAttempt,
  out: RunOutput,
  now = new Date(),
) {
  attempt.attempts++;
  attempt.lastResult = {
    passed: out.results.filter((r) => r.passed).length,
    total: out.results.length,
    at: now.toISOString(),
  };
  if (out.ok) attempt.status = 'passed';
  // First graded recall is evidence. Later retries are practice, not additional spaced-repetition credit.
  const card = reviewPool(cur, p).find((c) => c.id === 'drill:' + task.key);
  if (!attempt.reviewOutcome && card?.due === attempt.cycle) {
    const outcome = out.ok && !attempt.hintsShown && !attempt.solutionRevealed ? 'right' : 'wrong';
    if (applyReview(cur, p, card.id, outcome, now, true)) attempt.reviewOutcome = outcome;
  }
}

interface Dependencies {
  curriculum(): Curriculum;
  readonlyPaths(task: TaskItem): string[];
  progress?: () => Progress;
  save?: () => void;
  run?: typeof runJob;
}

/** Review has its own drafts, hints and grading history. It never calls the course saveFiles/itemProgress paths. */
export function mountReviewWorkbench(app: Express, deps: Dependencies) {
  const progress = deps.progress ?? getProgress;
  const save =
    deps.save ??
    (() => {
      saveProgress();
      flush();
    });
  const run = deps.run ?? runJob;
  const ordered = createSaveOrder();
  const prefix = '/api/review/items/:mod/:item';
  function target(req: Request, res: Response) {
    const cur = deps.curriculum(),
      p = progress();
    const task = cur.byKey.get(req.params.mod + '/' + req.params.item);
    if (!task || task.kind !== 'drill') {
      res.status(404).json({ error: 'No such review drill' });
      return null;
    }
    try {
      const attempt = reviewAttempt(cur, p, task);
      if (req.method !== 'GET' && req.body.cycle !== attempt.cycle) {
        res.status(409).json({
          error: 'This review belongs to an older session. Reload to open the current review.',
        });
        return null;
      }
      return { cur, p, task, attempt };
    } catch (error) {
      res.status(409).json({ error: (error as Error).message });
      return null;
    }
  }
  const snapshot = (task: TaskItem, attempt: ReviewAttempt, incoming: Files = {}) => {
    const ro = new Set(deps.readonlyPaths(task));
    const files = { ...attempt.files };
    for (const path of Object.keys(files))
      if (!ro.has(path) && typeof incoming[path] === 'string') files[path] = incoming[path];
    return files;
  };
  app.get(prefix, (req, res) => {
    const at = target(req, res);
    if (!at) return;
    const { task, attempt: a } = at;
    save();
    res.json({
      kind: task.kind,
      key: task.key,
      id: task.id,
      title: task.title,
      summary: task.summary,
      env: task.env,
      status: a.status,
      locked: false,
      instructions: task.instructions,
      focus: task.focus,
      readonly: deps.readonlyPaths(task),
      preview: !!task.preview,
      files: a.files,
      hints: task.hints.slice(0, a.hintsShown),
      hintCount: task.hints.length,
      needs: task.needs.map((key) => ({
        key,
        title: at.cur.byKey.get(key)?.title ?? key,
      })),
      attempts: a.attempts,
      lastResult: a.lastResult,
      solutionAvailable: solutionAvailable(a),
      solutionRevealed: a.solutionRevealed,
      reviewCycle: a.cycle,
      reviewOutcome: a.reviewOutcome,
    });
  });
  app.post(prefix + '/save', (req, res) => {
    const at = target(req, res);
    if (!at) return;
    ordered(at.task.key + ':' + at.attempt.cycle, req.body.version, () => {
      at.attempt.files = snapshot(at.task, at.attempt, req.body.files);
      save();
    });
    res.json({ ok: true });
  });
  for (const mode of ['run', 'submit'] as const)
    app.post(prefix + '/' + mode, async (req, res) => {
      const at = target(req, res);
      if (!at) return;
      const files = snapshot(at.task, at.attempt, req.body.files);
      const out = await run({
        mode: mode === 'submit' ? 'test' : 'run',
        files,
        tests: mode === 'submit' ? at.task.tests : undefined,
        env: mode === 'submit' ? at.task.env : 'node',
        db: at.task.db,
        entry: mode === 'run' ? Object.keys(files).find(isTaskLocal) : undefined,
      });
      if (mode === 'submit') {
        gradeReview(at.cur, at.p, at.task, at.attempt, out);
        save();
      }
      res.json({
        ...out,
        attempts: at.attempt.attempts,
        solutionAvailable: solutionAvailable(at.attempt),
        reviewOutcome: at.attempt.reviewOutcome,
      });
    });
  app.post(prefix + '/hint', (req, res) => {
    const at = target(req, res);
    if (!at) return;
    at.attempt.hintsShown = Math.min(at.task.hints.length, at.attempt.hintsShown + 1);
    save();
    res.json({ hints: at.task.hints.slice(0, at.attempt.hintsShown) });
  });
  app.post(prefix + '/solution', (req, res) => {
    const at = target(req, res);
    if (!at) return;
    if (!solutionAvailable(at.attempt))
      return void res.status(403).json({ error: 'Make at least 3 review attempts first.' });
    at.attempt.solutionRevealed = true;
    save();
    res.json({ files: at.task.solution });
  });
  app.post(prefix + '/reset', (req, res) => {
    const at = target(req, res);
    if (!at) return;
    const path = String(req.body.path ?? ''),
      files = taskStart(at.cur, at.task);
    if (!(path in files) || deps.readonlyPaths(at.task).includes(path))
      return void res.status(400).json({ error: 'Unknown editable file' });
    res.json({ path, content: files[path] });
  });
  app.post(prefix + '/preview', async (req, res) => {
    const at = target(req, res);
    if (!at) return;
    if (!at.task.preview) return void res.status(400).json({ error: 'This task has no preview' });
    const out = await buildBrowserBundle(
      'review/' + at.task.key,
      snapshot(at.task, at.attempt, req.body.files),
      at.task.preview,
    );
    res.json({
      ...out,
      url: '/preview/review/' + at.task.key + '/?t=' + Date.now(),
    });
  });
  app.get('/preview/review/:mod/:item/', (req, res) =>
    res.type('html').send(previewHtml('review/' + req.params.mod + '/' + req.params.item, 'Review preview')),
  );
  app.get('/preview/review/:mod/:item/bundle.:ext', (req, res) => {
    const b = getBundle('review/' + req.params.mod + '/' + req.params.item);
    res.type(req.params.ext === 'css' ? 'css' : 'js').send(req.params.ext === 'css' ? (b?.css ?? '') : (b?.js ?? ''));
  });
}
