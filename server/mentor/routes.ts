// The AI mentor's routes. The learner brings their own key for Anthropic or OpenAI. Keys stay in
// memory unless the learner ticks "Remember on this computer" (see keystore.ts). Conversations
// are saved in DATA_DIR/mentor/threads (see threads.ts). See docs/mentor/PLAN.md.
import type { Express, NextFunction, Request, Response } from 'express';
import type { Item } from '../content.js';
import { getProgress, saveProgress } from '../progress.js';
import { itemContext, progressNote } from './context.js';
import { keystore } from './keystore.js';
import { anthropicProvider } from './providers/anthropic.js';
import { openaiProvider, openaiSummaries } from './providers/openai.js';
import {
  Coded,
  CutShort,
  mentorError,
  scrub,
  type MentorError,
  type Connection,
  type Conversation,
  type MentorProvider,
  type ProviderId,
  type RoundUsage,
  type StepKind,
} from './providers/types.js';
import { loadThread, removeAllThreads, removeThread, writeThread, type DisplayMessage } from './threads.js';
import { runTool, toolSpecs, type MentorDeps } from './tools.js';

const PROVIDERS: Record<ProviderId, MentorProvider> = { anthropic: anthropicProvider, openai: openaiProvider };
const ORDER: ProviderId[] = ['anthropic', 'openai'];
const isProvider = (v: unknown): v is ProviderId => typeof v === 'string' && v in PROVIDERS;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:\-]{0,99}$/;
const MAX_ROUNDS = 8;
/** Characters, at about 3.5 per token: stays well under 200K input tokens, below any long-prompt price step. */
const MAX_HISTORY_CHARS = 200_000 * 3.5;

interface Thread {
  provider: ProviderId;
  /** An item key, or project-<workspace> for a forge project's shared thread. */
  scope: string;
  /** The model the history belongs to. */
  model: string | null;
  conv: Conversation | null;
  /** The connection conv was made with; a replaced key makes a new one from the saved history. */
  conn: Connection | null;
  /** Saved history waiting to become a conversation again, once there is a key. */
  saved: unknown;
  display: DisplayMessage[];
  lastNote: string;
  /** The item the last message was about. In a project thread it moves along the steps. */
  lastItem: string;
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
const threadId = (provider: ProviderId, scope: string) => `${provider}:${scope}`;

/** Forge steps share one thread per project, so the mentor remembers the earlier steps. */
const scopeOf = (item: Item) => (item.kind !== 'lesson' && item.workspace ? `project-${item.workspace}` : item.key);

const emptyThread = (provider: ProviderId, scope: string): Thread => ({
  provider,
  scope,
  model: null,
  conv: null,
  conn: null,
  saved: null,
  display: [],
  lastNote: '',
  lastItem: '',
  busy: false,
});

/** The thread in memory, or the saved one from disk. */
function findThread(provider: ProviderId, scope: string): Thread | undefined {
  const id = threadId(provider, scope);
  let t = threads.get(id);
  if (!t) {
    const s = loadThread(provider, scope);
    if (!s) return undefined;
    t = { ...emptyThread(provider, scope), model: s.model, saved: s.state, display: s.display, lastNote: s.lastNote, lastItem: s.lastItem };
    threads.set(id, t);
  }
  return t;
}

function persist(t: Thread) {
  try {
    writeThread({
      provider: t.provider,
      scope: t.scope,
      model: t.conv?.model ?? t.model,
      display: t.display,
      lastNote: t.lastNote,
      lastItem: t.lastItem,
      state: t.conv ? t.conv.save() : t.saved,
    });
  } catch (e) {
    console.warn("[mentor] couldn't save the conversation:", scrub((e as Error).message));
  }
}

/** Spend since the server started, shown in the panel's settings. */
const session = { cost: 0, unknown: false, replies: 0 };

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

/** A JSON error the panel can translate: see MentorError. */
const fail = (res: Response, status: number, err: MentorError) =>
  void res.status(status).json({ error: err.text, code: err.code, ...(err.vars ? { vars: err.vars } : {}) });

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
      session,
    });
  });

  app.put('/api/mentor/prefs', (req, res) => {
    const provider = req.body?.provider;
    const model = req.body?.model;
    if (!isProvider(provider)) return fail(res, 400, mentorError('unknownProvider', 'Unknown provider.'));
    if (typeof model !== 'string' || !MODEL_ID.test(model)) return fail(res, 400, mentorError('badModel', 'Bad model name.'));
    setPrefs({ provider, model });
    res.json({ provider, model });
  });

  app.get('/api/mentor/models', async (req, res) => {
    const id = req.query.provider;
    if (!isProvider(id)) return fail(res, 400, mentorError('unknownProvider', 'Unknown provider.'));
    const k = keys.get(id);
    if (!k) return void res.json({ models: PROVIDERS[id].suggestedModels });
    try {
      k.models = await k.conn.listModels();
      res.json({ models: k.models });
    } catch (e) {
      fail(res, 502, PROVIDERS[id].friendly(e));
    }
  });

  app.post('/api/mentor/key', async (req, res) => {
    const id = req.body?.provider;
    if (!isProvider(id)) return fail(res, 400, mentorError('unknownProvider', 'Unknown provider.'));
    const p = PROVIDERS[id];
    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
    if (!key) return fail(res, 400, mentorError('pasteKey', `Paste an ${p.name} API key.`, { provider: p.name }));
    const remember = req.body?.remember === true;
    const conn = p.connect(key);
    let models: string[];
    try {
      // Listing models is free and proves the key works.
      models = await conn.listModels();
    } catch (e) {
      return fail(res, 400, p.friendly(e));
    }
    if (!models.length) {
      return fail(res, 400, mentorError('noChatModel', `This key can't use any ${p.name} chat model.`, { provider: p.name }));
    }
    let remembered = false;
    let warning: MentorError | undefined;
    try {
      if (remember) {
        await keystore.save(id, key);
        remembered = true;
      } else await keystore.remove(id);
    } catch (e) {
      const detail = scrub((e as Error).message);
      warning = mentorError('keyNotSaved', `The key works, but it wasn't saved: ${detail}`, { detail });
    }
    keys.set(id, { conn, models, remembered });
    const current = prefs();
    const model = current.provider === id && models.includes(current.model) ? current.model : (models.includes(p.defaultModel) ? p.defaultModel : models[0]);
    setPrefs({ provider: id, model });
    res.json({ ...providerStatus(p), model, warning });
  });

  app.delete('/api/mentor/key', async (req, res) => {
    const id = req.query.provider;
    if (!isProvider(id)) return fail(res, 400, mentorError('unknownProvider', 'Unknown provider.'));
    keys.delete(id);
    try {
      await keystore.remove(id);
    } catch (e) {
      const detail = scrub((e as Error).message);
      return fail(res, 500, mentorError('keyNotRemoved', `Forgotten for now, but the saved copy couldn't be removed: ${detail}`, { detail }));
    }
    res.json(providerStatus(PROVIDERS[id]));
  });

  /** Provider and scope of the thread a request names by item key, or null for an unknown item. */
  const threadOf = (req: Request) => {
    const item = deps.curriculum().byKey.get(String(req.query.item ?? ''));
    if (!item) return null;
    return { provider: isProvider(req.query.provider) ? req.query.provider : prefs().provider, scope: scopeOf(item) };
  };

  app.get('/api/mentor/thread', (req, res) => {
    const at = threadOf(req);
    if (!at) return fail(res, 404, mentorError('noItem', 'No such item.'));
    const t = findThread(at.provider, at.scope);
    res.json({
      messages: t?.display ?? [],
      model: t?.conv?.model ?? t?.model ?? null,
      scope: at.scope,
      lastItem: t?.lastItem ?? null,
    });
  });

  app.delete('/api/mentor/thread', (req, res) => {
    const at = threadOf(req);
    if (!at) return fail(res, 404, mentorError('noItem', 'No such item.'));
    const id = threadId(at.provider, at.scope);
    if (threads.get(id)?.busy) return fail(res, 409, mentorError('stillAnswering', 'Still answering the last message.'));
    threads.delete(id);
    try {
      removeThread(at.provider, at.scope);
    } catch (e) {
      const detail = scrub((e as Error).message);
      return fail(res, 500, mentorError('deleteFailed', `Couldn't delete the saved conversation: ${detail}`, { detail }));
    }
    res.json({ ok: true });
  });

  app.delete('/api/mentor/threads', (_req, res) => {
    if ([...threads.values()].some((t) => t.busy)) return fail(res, 409, mentorError('stillAnswering', 'Still answering the last message.'));
    threads.clear();
    try {
      removeAllThreads();
    } catch (e) {
      const detail = scrub((e as Error).message);
      return fail(res, 500, mentorError('deleteFailed', `Couldn't delete the saved conversations: ${detail}`, { detail }));
    }
    res.json({ ok: true });
  });

  app.post('/api/mentor/chat', async (req, res) => {
    const itemKey = typeof req.body?.itemKey === 'string' ? req.body.itemKey : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const id = req.body?.provider;
    const model = req.body?.model;
    const item: Item | undefined = deps.curriculum().byKey.get(itemKey);
    if (!item) return fail(res, 404, mentorError('openItem', 'Open a lesson or exercise first.'));
    if (!message) return fail(res, 400, mentorError('emptyMessage', 'Empty message.'));
    if (!isProvider(id)) return fail(res, 400, mentorError('unknownProvider', 'Unknown provider.'));
    if (typeof model !== 'string' || !MODEL_ID.test(model)) return fail(res, 400, mentorError('badModel', 'Bad model name.'));
    const p = PROVIDERS[id];
    const k = keys.get(id);
    if (!k) return fail(res, 400, mentorError('noKey', `Add an ${p.name} key first.`, { provider: p.name }));
    const effort: string = p.efforts.includes(req.body?.effort) ? req.body.effort : p.defaultEffort;

    const scope = scopeOf(item);
    let t = findThread(id, scope);
    if (t?.busy) return fail(res, 409, mentorError('stillAnswering', 'Still answering the last message.'));
    // Another model can't reuse this thread's cache or its reasoning, so a model change starts over.
    const had = t?.conv?.model ?? t?.model;
    if (!t || (had && had !== model)) {
      t = emptyThread(id, scope);
      threads.set(threadId(id, scope), t);
    }
    const thread = t;
    thread.busy = true;
    // A conversation made with a key that was since replaced or forgotten carries on from its history.
    if (thread.conv && thread.conn !== k.conn) {
      thread.saved = thread.conv.save();
      thread.conv = null;
    }

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

    const fresh = !thread.conv && thread.saved == null;
    if (!thread.conv) {
      thread.conv = k.conn.conversation(model, scope, thread.saved ?? undefined);
      thread.conn = k.conn;
      thread.saved = null;
      thread.model = model;
    }
    const conv = thread.conv;
    // In a project thread the learner moves along the steps. The new step's context is appended,
    // so everything before it stays cached.
    const moved = !fresh && !!thread.lastItem && thread.lastItem !== itemKey;
    const note = progressNote(item);
    conv.addTurn({
      context: fresh
        ? itemContext(deps, item)
        : moved
          ? 'The learner has moved to another step of this project. This item context replaces the earlier one; ' +
            'the earlier messages stay for reference.\n\n' +
            itemContext(deps, item)
          : undefined,
      note: moved || note !== thread.lastNote ? note : undefined,
      message,
      effort,
    });
    thread.lastNote = note;
    thread.lastItem = itemKey;
    thread.display.push({ role: 'user', text: message, ...(moved ? { moved: item.title } : {}) });
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
      if (u.cost === null) session.unknown = true;
      else session.cost += u.cost;
      send({ type: 'usage', ...u, cost: reply.cost });
    };
    session.replies++;

    /** A request is under way. Stopping it still bills the tokens so far, which no one reports. */
    let inFlight = false;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (conv.size() > MAX_HISTORY_CHARS) {
          throw new Coded(mentorError('tooLong', 'This conversation is too long. Start a new one to keep costs down.'));
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
      if (ctl.signal.aborted) throw new Coded(mentorError('stopped', 'Stopped.'));
      send({ type: 'done' });
    } catch (e) {
      if (e instanceof CutShort) count(e.usage);
      else if (inFlight && ctl.signal.aborted && reply.cost !== null) {
        reply.cost = null;
        session.unknown = true;
        send({ type: 'usage', cost: null });
      }
      const err = ctl.signal.aborted
        ? mentorError('stopped', 'Stopped.')
        : e instanceof Coded || e instanceof CutShort
          ? e.error
          : p.friendly(e, model);
      reply.error = err.text;
      reply.errorCode = err.code;
      if (err.vars) reply.errorVars = err.vars;
      if (!ctl.signal.aborted) console.error('[mentor]', scrub(e instanceof Error ? e.message : String(e)));
      send({ type: 'error', message: err.text, code: err.code, ...(err.vars ? { vars: err.vars } : {}) });
    } finally {
      thread.busy = false;
      persist(thread);
      res.end();
    }
  });
}
