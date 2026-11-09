// The AI mentor's routes. The learner brings their own key for Anthropic or OpenAI. Keys stay in
// memory unless the learner ticks "Remember on this computer" (see keystore.ts). Conversations
// stay in memory. See docs/mentor/PLAN.md.
import type { Express, NextFunction, Request, Response } from 'express';
import type { Item } from '../content.js';
import { getProgress, saveProgress } from '../progress.js';
import { itemContext, progressNote } from './context.js';
import { keystore } from './keystore.js';
import { anthropicProvider } from './providers/anthropic.js';
import { openaiProvider, openaiSummaries } from './providers/openai.js';
import {
  CutShort,
  scrub,
  type Connection,
  type Conversation,
  type MentorProvider,
  type ProviderId,
  type RoundUsage,
  type StepKind,
} from './providers/types.js';
import { runTool, toolSpecs, type MentorDeps } from './tools.js';

const PROVIDERS: Record<ProviderId, MentorProvider> = { anthropic: anthropicProvider, openai: openaiProvider };
const ORDER: ProviderId[] = ['anthropic', 'openai'];
const isProvider = (v: unknown): v is ProviderId => typeof v === 'string' && v in PROVIDERS;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:\-]{0,99}$/;
const MAX_ROUNDS = 8;
/** Characters, at about 3.5 per token: stays well under 200K input tokens, below any long-prompt price step. */
const MAX_HISTORY_CHARS = 200_000 * 3.5;

type Step = { kind: StepKind; text: string };
interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  steps?: Step[];
  effort?: string;
  model?: string;
  /** USD; null when the model's price isn't known. */
  cost?: number | null;
  error?: string;
}
interface Thread {
  conv: Conversation | null;
  display: DisplayMessage[];
  lastNote: string;
  busy: boolean;
}
interface KeyState {
  conn: Connection;
  /** Filled when the key is checked, or on the first models request after a restart. */
  models: string[] | null;
  remembered: boolean;
}

// Keys live only in this map (and the key store when the learner asks). Never logged or sent to the browser.
const keys = new Map<ProviderId, KeyState>();
const threads = new Map<string, Thread>();
const threadId = (provider: ProviderId, item: string) => `${provider}:${item}`;

const ENV_KEYS: Record<ProviderId, string | undefined> = {
  anthropic: process.env.FORGE_MENTOR_ANTHROPIC_KEY,
  openai: process.env.FORGE_MENTOR_OPENAI_KEY,
};

/** Remembered keys load once at startup; routes wait for it so the panel never flashes the key form. */
const ready = (async () => {
  for (const id of ORDER) {
    let key = ENV_KEYS[id] || null;
    let remembered = false;
    if (!key) {
      try {
        key = await keystore.load(id);
        remembered = !!key;
      } catch (e) {
        console.warn(`[mentor] couldn't unlock the remembered ${PROVIDERS[id].name} key:`, scrub((e as Error).message));
      }
    }
    if (key) keys.set(id, { conn: PROVIDERS[id].connect(key), models: null, remembered });
  }
})();

interface Prefs {
  provider: ProviderId;
  model: string;
}

/** The learner's last provider and model. Saved with progress; the key never is. */
function prefs(): Prefs {
  const saved = getProgress().settings.mentor;
  const provider = isProvider(saved?.provider)
    ? saved.provider
    : (ORDER.find((id) => keys.has(id)) ?? 'anthropic');
  const model =
    saved?.provider === provider && saved.model && MODEL_ID.test(saved.model)
      ? saved.model
      : PROVIDERS[provider].defaultModel;
  return { provider, model };
}

function setPrefs(next: Prefs) {
  const p = getProgress();
  p.settings = { ...p.settings, mentor: next };
  saveProgress();
}

/** Mentor routes spend the learner's money, so only this app's own pages may call them. */
function sameOrigin(req: Request, res: Response, next: NextFunction) {
  const host = req.headers.host ?? '';
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) {
    return void res.status(403).json({ error: 'Wrong host.' });
  }
  const origin = req.headers.origin;
  if (origin ? origin !== `http://${host}` : req.method !== 'GET') {
    return void res.status(403).json({ error: 'Wrong origin.' });
  }
  if ((req.method === 'POST' || req.method === 'PUT') && !req.is('application/json')) {
    return void res.status(415).json({ error: 'JSON only.' });
  }
  next();
}

function providerStatus(p: MentorProvider) {
  const k = keys.get(p.id);
  return {
    id: p.id,
    name: p.name,
    keyPlaceholder: p.keyPlaceholder,
    hasKey: !!k,
    remembered: !!k?.remembered,
    models: k?.models ?? p.suggestedModels,
    defaultModel: p.defaultModel,
    efforts: p.efforts,
    defaultEffort: p.defaultEffort,
  };
}

export function mountMentor(app: Express, deps: MentorDeps) {
  app.use('/api/mentor', sameOrigin);
  app.use('/api/mentor', (_req, _res, next) => void ready.then(() => next()));

  app.get('/api/mentor/status', (_req, res) => {
    const { provider, model } = prefs();
    res.json({
      provider,
      model,
      providers: ORDER.map((id) => providerStatus(PROVIDERS[id])),
      keystore: { kind: keystore.kind, where: keystore.where },
      summaries: openaiSummaries(),
    });
  });

  app.put('/api/mentor/prefs', (req, res) => {
    const provider = req.body?.provider;
    const model = req.body?.model;
    if (!isProvider(provider)) return void res.status(400).json({ error: 'Unknown provider.' });
    if (typeof model !== 'string' || !MODEL_ID.test(model)) return void res.status(400).json({ error: 'Bad model name.' });
    setPrefs({ provider, model });
    res.json({ provider, model });
  });

  app.get('/api/mentor/models', async (req, res) => {
    const id = req.query.provider;
    if (!isProvider(id)) return void res.status(400).json({ error: 'Unknown provider.' });
    const k = keys.get(id);
    if (!k) return void res.json({ models: PROVIDERS[id].suggestedModels });
    try {
      k.models = await k.conn.listModels();
      res.json({ models: k.models });
    } catch (e) {
      res.status(502).json({ error: PROVIDERS[id].friendly(e) });
    }
  });

  app.post('/api/mentor/key', async (req, res) => {
    const id = req.body?.provider;
    if (!isProvider(id)) return void res.status(400).json({ error: 'Unknown provider.' });
    const p = PROVIDERS[id];
    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
    if (!key) return void res.status(400).json({ error: `Paste an ${p.name} API key.` });
    const remember = req.body?.remember === true;
    const conn = p.connect(key);
    let models: string[];
    try {
      // Listing models is free and proves the key works.
      models = await conn.listModels();
    } catch (e) {
      return void res.status(400).json({ error: p.friendly(e) });
    }
    if (!models.length) return void res.status(400).json({ error: `This key can't use any ${p.name} chat model.` });
    let remembered = false;
    let warning: string | undefined;
    try {
      if (remember) {
        await keystore.save(id, key);
        remembered = true;
      } else await keystore.remove(id);
    } catch (e) {
      warning = `The key works, but it wasn't saved: ${scrub((e as Error).message)}`;
    }
    keys.set(id, { conn, models, remembered });
    const current = prefs();
    const model = current.provider === id && models.includes(current.model) ? current.model : (models.includes(p.defaultModel) ? p.defaultModel : models[0]);
    setPrefs({ provider: id, model });
    res.json({ ...providerStatus(p), model, warning });
  });

  app.delete('/api/mentor/key', async (req, res) => {
    const id = req.query.provider;
    if (!isProvider(id)) return void res.status(400).json({ error: 'Unknown provider.' });
    keys.delete(id);
    for (const [k, t] of threads) if (k.startsWith(id + ':') && !t.busy) threads.delete(k);
    try {
      await keystore.remove(id);
    } catch (e) {
      return void res.status(500).json({ error: `Forgotten for now, but the saved copy couldn't be removed: ${scrub((e as Error).message)}` });
    }
    res.json(providerStatus(PROVIDERS[id]));
  });

  const threadOf = (req: Request) => {
    const provider = isProvider(req.query.provider) ? req.query.provider : prefs().provider;
    return threadId(provider, String(req.query.item ?? ''));
  };

  app.get('/api/mentor/thread', (req, res) => {
    const t = threads.get(threadOf(req));
    res.json({ messages: t?.display ?? [], model: t?.conv?.model ?? null });
  });

  app.delete('/api/mentor/thread', (req, res) => {
    const id = threadOf(req);
    if (threads.get(id)?.busy) return void res.status(409).json({ error: 'Still answering.' });
    threads.delete(id);
    res.json({ ok: true });
  });

  app.post('/api/mentor/chat', async (req, res) => {
    const itemKey = typeof req.body?.itemKey === 'string' ? req.body.itemKey : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const id = req.body?.provider;
    const model = req.body?.model;
    const item: Item | undefined = deps.curriculum().byKey.get(itemKey);
    if (!item) return void res.status(404).json({ error: 'Open a lesson or exercise first.' });
    if (!message) return void res.status(400).json({ error: 'Empty message.' });
    if (!isProvider(id)) return void res.status(400).json({ error: 'Unknown provider.' });
    if (typeof model !== 'string' || !MODEL_ID.test(model)) return void res.status(400).json({ error: 'Bad model name.' });
    const p = PROVIDERS[id];
    const k = keys.get(id);
    if (!k) return void res.status(400).json({ error: `Add an ${p.name} key first.` });
    const effort: string = p.efforts.includes(req.body?.effort) ? req.body.effort : p.defaultEffort;

    const tid = threadId(id, itemKey);
    let t = threads.get(tid);
    if (t?.busy) return void res.status(409).json({ error: 'Still answering the last message.' });
    // Another model can't reuse this thread's cache or its reasoning, so a model change starts over.
    if (!t || (t.conv && t.conv.model !== model)) {
      t = { conv: null, display: [], lastNote: '', busy: false };
      threads.set(tid, t);
    }
    const thread = t;
    thread.busy = true;

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
    });
    const send = (event: Record<string, unknown>) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const ctl = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) ctl.abort();
    });

    const fresh = !thread.conv;
    const conv = (thread.conv ??= k.conn.conversation(model, itemKey));
    const note = progressNote(item);
    conv.addTurn({
      context: fresh ? itemContext(deps, item) : undefined,
      note: note !== thread.lastNote ? note : undefined,
      message,
      effort,
    });
    thread.lastNote = note;
    thread.display.push({ role: 'user', text: message });
    const reply: DisplayMessage = { role: 'assistant', text: '', steps: [], effort, model, cost: 0 };
    thread.display.push(reply);

    const sink = {
      text(delta: string) {
        reply.text += delta;
        send({ type: 'text', delta });
      },
      step(kind: StepKind, text: string, append = false) {
        const last = reply.steps!.at(-1);
        if (append && last?.kind === kind) last.text += text;
        else reply.steps!.push({ kind, text });
        send({ type: 'step', kind, text, append });
      },
    };
    const count = (u: RoundUsage) => {
      reply.cost = u.cost === null || reply.cost === null || reply.cost === undefined ? null : reply.cost + u.cost;
      send({ type: 'usage', ...u, cost: reply.cost });
    };

    /** A request is under way. Stopping it still bills the tokens so far, which no one reports. */
    let inFlight = false;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (conv.size() > MAX_HISTORY_CHARS) {
          throw new Error('This conversation is too long. Start a new one to keep costs down.');
        }
        inFlight = true;
        const { calls, usage } = await conv.round(sink, ctl.signal, toolSpecs(item));
        inFlight = false;
        count(usage);
        if (!calls.length) break;
        // Every call gets an answer, even when stopped, or the next request is rejected.
        const results: { id: string; output: string }[] = [];
        for (const call of calls) {
          const outcome = ctl.signal.aborted
            ? { output: 'Cancelled by the learner.', label: '' }
            : await runTool(deps, item, call.name, call.args, ctl.signal);
          results.push({ id: call.id, output: outcome.output });
          if (outcome.label) sink.step('tool', outcome.label);
        }
        conv.addToolResults(results);
        if (ctl.signal.aborted) break;
        if (reply.text && !reply.text.endsWith('\n')) sink.text('\n\n');
      }
      if (ctl.signal.aborted) throw new Error('Stopped.');
      send({ type: 'done' });
    } catch (e) {
      if (e instanceof CutShort) count(e.usage);
      else if (inFlight && ctl.signal.aborted && reply.cost !== null) {
        reply.cost = null;
        send({ type: 'usage', cost: null });
      }
      const msg = ctl.signal.aborted ? 'Stopped.' : p.friendly(e, model);
      reply.error = msg;
      if (!ctl.signal.aborted) console.error('[mentor]', scrub(e instanceof Error ? e.message : String(e)));
      send({ type: 'error', message: msg });
    } finally {
      thread.busy = false;
      res.end();
    }
  });
}
