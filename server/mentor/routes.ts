// Phase 0 spike of the AI mentor: one provider (OpenAI, GPT-6.1 Terra), key in memory only,
// conversations in memory only. See docs/mentor/PLAN.md for where this is going.
import type { Express, NextFunction, Request, Response } from 'express';
import OpenAI from 'openai';
import type { ResponseInputItem, Response as OpenAIResponse } from 'openai/resources/responses/responses';
import type { Item } from '../content.js';
import { MENTOR_INSTRUCTIONS } from './prompt.js';
import { itemContext, progressNote } from './context.js';
import { TOOL_SPECS, runTool, type MentorDeps } from './tools.js';

const MODEL = process.env.FORGE_MENTOR_MODEL ?? 'gpt-6.1-terra';
const EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORTS)[number];
const DEFAULT_EFFORT: Effort = 'medium';
const MAX_ROUNDS = 8;
/** A ceiling, not a target: reasoning counts against it, and OpenAI suggests leaving room for it. */
const MAX_OUTPUT_TOKENS = 32_000;
/** Terra bills the whole request higher past 272K input tokens, so stay well under. */
const MAX_INPUT_TOKENS = 200_000;
/** USD per million tokens for GPT-6.1 Terra (OpenAI model page, 2026-11-09). */
const PRICE = { input: 1, cached: 0.05, cacheWrite: 1.25, output: 5 };

/** What happened on the way to an answer, in order: reasoning summaries, progress notes, tool calls. */
type Step = { kind: 'thinking' | 'note' | 'tool'; text: string };
interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  steps?: Step[];
  effort?: Effort;
  cost?: number;
  error?: string;
}
interface Thread {
  input: ResponseInputItem[];
  display: DisplayMessage[];
  lastNote: string;
  busy: boolean;
  /** Effort sent on every request of this thread. Never changes, so the cached prefix holds. */
  baseEffort: Effort | null;
  /** Effort in force, changed with configuration_update items. */
  effort: Effort | null;
}

// The key lives only in this variable (or the environment). It is never logged, stored or sent to the browser.
let apiKey: string | null = process.env.FORGE_MENTOR_OPENAI_KEY || null;
let client: OpenAI | null = apiKey ? new OpenAI({ apiKey, maxRetries: 2, timeout: 300_000 }) : null;
/** Reasoning summaries need a verified OpenAI organization. Turned off for the session after the first refusal. */
let summaries = process.env.FORGE_MENTOR_SUMMARIES !== '0';
const threads = new Map<string, Thread>();

const thread = (key: string): Thread => {
  let t = threads.get(key);
  if (!t) threads.set(key, (t = { input: [], display: [], lastNote: '', busy: false, baseEffort: null, effort: null }));
  return t;
};

const scrub = (s: string) => s.replace(/sk-[A-Za-z0-9_*\-]{6,}/g, '[key]');

/** A message safe to show the learner. Never passes the provider's raw 401 text, which can echo part of the key. */
function friendly(e: unknown): string {
  if (e instanceof OpenAI.APIUserAbortError) return 'Stopped.';
  if (e instanceof OpenAI.APIConnectionError) return "Couldn't reach OpenAI. Check the internet connection.";
  if (e instanceof OpenAI.APIError) {
    if (e.status === 401) return 'OpenAI rejected the key.';
    if (e.status === 403) return `This key isn't allowed to use ${MODEL}.`;
    if (e.status === 404) return `OpenAI doesn't offer ${MODEL} to this key.`;
    if (e.status === 429) return 'OpenAI said slow down or out of credit (429). Check the usage limits on the OpenAI account.';
    if (e.status && e.status >= 500) return 'OpenAI is having trouble right now. Try again in a minute.';
    return scrub(`OpenAI refused the request (${e.status ?? '?'}): ${e.message}`);
  }
  return scrub((e as Error)?.message ?? String(e));
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
  if (req.method === 'POST' && !req.is('application/json')) {
    return void res.status(415).json({ error: 'JSON only.' });
  }
  next();
}

function costOf(usage: OpenAIResponse['usage']): number {
  if (!usage) return 0;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const written = usage.input_tokens_details?.cache_write_tokens ?? 0;
  const fresh = Math.max(0, usage.input_tokens - cached - written);
  return (fresh * PRICE.input + cached * PRICE.cached + written * PRICE.cacheWrite + usage.output_tokens * PRICE.output) / 1e6;
}

export function mountMentor(app: Express, deps: MentorDeps) {
  app.use('/api/mentor', sameOrigin);

  app.get('/api/mentor/status', (_req, res) => {
    res.json({ hasKey: !!client, model: MODEL, efforts: EFFORTS, defaultEffort: DEFAULT_EFFORT, summaries, provider: 'openai' });
  });

  app.post('/api/mentor/key', async (req, res) => {
    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
    if (!key) return void res.status(400).json({ error: 'Paste an OpenAI API key.' });
    const candidate = new OpenAI({ apiKey: key, maxRetries: 1, timeout: 20_000 });
    try {
      await candidate.models.retrieve(MODEL);
    } catch (e) {
      return void res.status(400).json({ error: friendly(e) });
    }
    apiKey = key;
    client = new OpenAI({ apiKey, maxRetries: 2, timeout: 300_000 });
    res.json({ hasKey: true, model: MODEL });
  });

  app.delete('/api/mentor/key', (_req, res) => {
    apiKey = null;
    client = null;
    res.json({ hasKey: false });
  });

  app.get('/api/mentor/thread', (req, res) => {
    const key = String(req.query.item ?? '');
    res.json({ messages: threads.get(key)?.display ?? [] });
  });

  app.delete('/api/mentor/thread', (req, res) => {
    const key = String(req.query.item ?? '');
    if (threads.get(key)?.busy) return void res.status(409).json({ error: 'Still answering.' });
    threads.delete(key);
    res.json({ ok: true });
  });

  app.post('/api/mentor/chat', async (req, res) => {
    const itemKey = typeof req.body?.itemKey === 'string' ? req.body.itemKey : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const effort: Effort = EFFORTS.includes(req.body?.effort) ? req.body.effort : DEFAULT_EFFORT;
    const item: Item | undefined = deps.curriculum().byKey.get(itemKey);
    if (!item) return void res.status(404).json({ error: 'Open a lesson or exercise first.' });
    if (!message) return void res.status(400).json({ error: 'Empty message.' });
    if (!client) return void res.status(400).json({ error: 'Add an OpenAI key first.' });
    const t = thread(itemKey);
    if (t.busy) return void res.status(409).json({ error: 'Still answering the last message.' });
    t.busy = true;

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

    if (!t.input.length) {
      t.input.push({ role: 'developer', content: itemContext(deps, item) });
    }
    const note = progressNote(item);
    if (note !== t.lastNote) {
      t.input.push({ role: 'developer', content: note });
      t.lastNote = note;
    }
    // The first message fixes the thread's request-level effort; later changes ride in the input
    // as configuration_update items, which keeps everything before them cached.
    if (!t.baseEffort) t.baseEffort = t.effort = effort;
    else if (effort !== t.effort) {
      t.input.push({ type: 'configuration_update', reasoning: { effort } });
      t.effort = effort;
    }
    t.input.push({ role: 'user', content: message });
    t.display.push({ role: 'user', text: message });
    const reply: DisplayMessage = { role: 'assistant', text: '', steps: [], effort, cost: 0 };
    t.display.push(reply);
    const step = (kind: Step['kind'], text: string, append = false) => {
      const last = reply.steps!.at(-1);
      if (append && last?.kind === kind) last.text += text;
      else reply.steps!.push({ kind, text });
      send({ type: 'step', kind, text, append });
    };

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const estimate = Math.ceil(JSON.stringify(t.input).length / 3.5);
        if (estimate > MAX_INPUT_TOKENS) {
          throw new Error('This conversation is too long. Start a new one to keep costs down.');
        }
        const request = () =>
          client!.responses.create(
            {
              model: MODEL,
              instructions: MENTOR_INSTRUCTIONS,
              input: t.input,
              tools: TOOL_SPECS.map((s) => ({ type: 'function' as const, strict: true, ...s })),
              tool_choice: 'auto',
              reasoning: { effort: t.baseEffort, ...(summaries ? { summary: 'auto' as const } : {}) },
              max_output_tokens: MAX_OUTPUT_TOKENS,
              store: false,
              include: ['reasoning.encrypted_content'],
              prompt_cache_key: 'forge-mentor:' + itemKey,
              stream: true,
            },
            { signal: ctl.signal },
          );
        let stream;
        try {
          stream = await request();
        } catch (e) {
          const refusedSummary =
            summaries && e instanceof OpenAI.APIError && e.status === 400 && /summar|verif/i.test(e.message);
          if (!refusedSummary) throw e;
          summaries = false;
          console.warn('[mentor] reasoning summaries refused for this key; continuing without them');
          stream = await request();
        }
        let final: OpenAIResponse | null = null;
        // Assistant text marked phase "commentary" is a progress note, not the answer.
        const commentary = new Set<string>();
        for await (const ev of stream) {
          if (ev.type === 'response.output_item.added') {
            if (ev.item.type === 'message' && ev.item.phase === 'commentary') commentary.add(ev.item.id);
          } else if (ev.type === 'response.reasoning_summary_part.added') {
            step('thinking', '');
          } else if (ev.type === 'response.reasoning_summary_text.delta') {
            step('thinking', ev.delta, true);
          } else if (ev.type === 'response.output_text.delta' || ev.type === 'response.refusal.delta') {
            if (commentary.has(ev.item_id)) step('note', ev.delta, true);
            else {
              reply.text += ev.delta;
              send({ type: 'text', delta: ev.delta });
            }
          } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
            final = ev.response;
          } else if (ev.type === 'response.failed') {
            throw new Error(ev.response.error?.message ?? 'The response failed.');
          } else if (ev.type === 'error') {
            throw new Error(ev.message);
          }
        }
        if (!final) throw new Error('The stream ended without a response.');
        t.input.push(...(final.output as unknown as ResponseInputItem[]));
        const cost = costOf(final.usage);
        reply.cost = (reply.cost ?? 0) + cost;
        send({
          type: 'usage',
          cost: reply.cost,
          input: final.usage?.input_tokens,
          cached: final.usage?.input_tokens_details?.cached_tokens,
          output: final.usage?.output_tokens,
          reasoning: final.usage?.output_tokens_details?.reasoning_tokens,
          cacheMiss:
            final.prompt_cache_diagnostics?.type === 'cache_miss' ? final.prompt_cache_diagnostics.reason : undefined,
        });
        if (final.status === 'incomplete') {
          throw new Error(`The reply was cut short (${final.incomplete_details?.reason ?? 'unknown reason'}).`);
        }
        const calls = final.output.filter((o) => o.type === 'function_call');
        if (!calls.length) break;
        // Every call gets an output, even when stopped, or the next request is rejected.
        for (const call of calls) {
          const outcome = ctl.signal.aborted
            ? { output: 'Cancelled by the learner.', label: '' }
            : await runTool(deps, item, call.name, call.arguments, ctl.signal);
          t.input.push({ type: 'function_call_output', call_id: call.call_id, output: outcome.output });
          if (outcome.label) step('tool', outcome.label);
        }
        if (ctl.signal.aborted) throw new OpenAI.APIUserAbortError();
        if (reply.text && !reply.text.endsWith('\n')) {
          reply.text += '\n\n';
          send({ type: 'text', delta: '\n\n' });
        }
      }
      send({ type: 'done' });
    } catch (e) {
      const msg = friendly(e);
      reply.error = msg;
      console.error('[mentor]', scrub(e instanceof Error ? e.message : String(e)));
      send({ type: 'error', message: msg });
    } finally {
      t.busy = false;
      res.end();
    }
  });
}
