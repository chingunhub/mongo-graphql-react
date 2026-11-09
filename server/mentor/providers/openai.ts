// OpenAI through the Responses API. Moved from the Phase 0 spike in routes.ts.
import OpenAI from 'openai';
import { SidebandWS } from 'openai/resources/live/sideband/ws';
import type { ResponseInputItem, Response as OpenAIResponse } from 'openai/resources/responses/responses';
import { MENTOR_INSTRUCTIONS } from '../prompt.js';
import type { ToolSpec } from '../tools.js';
import {
  CutShort,
  mentorError,
  scrub,
  usd,
  type Connection,
  type Conversation,
  type MentorProvider,
  type Price,
  type RoundResult,
  type Sink,
  type Turn,
} from './types.js';

const DEFAULT_MODEL = process.env.FORGE_MENTOR_MODEL ?? 'gpt-6.1-terra';
const EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
/** A ceiling, not a target: reasoning counts against it, and OpenAI suggests leaving room for it. */
const MAX_OUTPUT_TOKENS = 32_000;

/** USD per million tokens (OpenAI model pages, 2026-11-09). Other models show no cost. */
const PRICES: [RegExp, Price][] = [[/^gpt-6\.1-terra\b/, { input: 1, cached: 0.05, cacheWrite: 1.25, output: 5 }]];

/** Reasoning summaries need a verified OpenAI organization. Turned off for the session after the first refusal. */
let summaries = process.env.FORGE_MENTOR_SUMMARIES !== '0';
export const openaiSummaries = () => summaries;

/** USD for one response's usage, or null when the model's price isn't known. Voice uses it for Terra's share. */
export function costOf(model: string, usage: OpenAIResponse['usage']): number | null {
  const price = PRICES.find(([re]) => re.test(model))?.[1];
  if (!usage) return 0;
  if (!price) return null;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const written = usage.input_tokens_details?.cache_write_tokens ?? 0;
  const fresh = Math.max(0, usage.input_tokens - cached - written);
  return (
    usd(fresh, price.input) +
    usd(cached, price.cached) +
    usd(written, price.cacheWrite) +
    usd(usage.output_tokens, price.output)
  );
}

/** Models that can hold a text conversation with tools. The models list also has audio, image and embedding models. */
const isChatModel = (id: string) =>
  /^(gpt-|o\d)/.test(id) && !/audio|realtime|tts|transcribe|image|embedding|live|search|instruct/.test(id);

class OpenAIConversation implements Conversation {
  private input: ResponseInputItem[] = [];
  /** Effort sent on every request of this thread. Never changes, so the cached prefix holds. */
  private baseEffort: string | null = null;
  /** Effort in force, changed with configuration_update items. */
  private effort: string | null = null;
  /** True once a request in this thread has gone through. Until then the base effort can still change. */
  private answered = false;
  /** This turn's effort change, undone if the model refuses it. */
  private change: { at: number; before: string | null } | null = null;

  constructor(
    private client: OpenAI,
    readonly model: string,
    private threadKey: string,
    saved?: unknown,
  ) {
    const s = saved as Partial<Record<'input' | 'baseEffort' | 'effort' | 'answered', unknown>> | undefined;
    if (s && Array.isArray(s.input)) {
      this.input = s.input as ResponseInputItem[];
      this.baseEffort = typeof s.baseEffort === 'string' ? s.baseEffort : null;
      this.effort = typeof s.effort === 'string' ? s.effort : this.baseEffort;
      this.answered = s.answered === true;
    }
  }

  save() {
    return { input: this.input, baseEffort: this.baseEffort, effort: this.effort, answered: this.answered };
  }

  addTurn({ context, note, message, effort }: Turn) {
    if (context) this.input.push({ role: 'developer', content: context });
    if (note) this.input.push({ role: 'developer', content: note });
    // The first message fixes the thread's request-level effort; later changes ride in the input
    // as configuration_update items, which keeps everything before them cached.
    this.change = null;
    if (!this.answered) this.baseEffort = this.effort = effort;
    else if (effort !== this.effort) {
      this.change = { at: this.input.length, before: this.effort };
      this.input.push({ type: 'configuration_update', reasoning: { effort: effort as (typeof EFFORTS)[number] } });
      this.effort = effort;
    }
    this.input.push({ role: 'user', content: message });
  }

  addToolResults(results: { id: string; output: string }[]) {
    for (const r of results) this.input.push({ type: 'function_call_output', call_id: r.id, output: r.output });
  }

  size() {
    return JSON.stringify(this.input).length;
  }

  async round(sink: Sink, signal: AbortSignal, tools: ToolSpec[]): Promise<RoundResult> {
    const request = () =>
      this.client.responses.create(
        {
          model: this.model,
          instructions: MENTOR_INSTRUCTIONS,
          input: this.input,
          tools: tools.map((s) => ({ type: 'function' as const, strict: true, ...s })),
          tool_choice: 'auto',
          reasoning: {
            effort: this.baseEffort as (typeof EFFORTS)[number],
            ...(summaries ? { summary: 'auto' as const } : {}),
          },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false,
          include: ['reasoning.encrypted_content'],
          prompt_cache_key: 'forge-mentor:' + this.threadKey,
          stream: true,
        },
        { signal },
      );
    let stream;
    try {
      stream = await request();
    } catch (e) {
      const refusedSummary =
        summaries && e instanceof OpenAI.APIError && e.status === 400 && /summar|verif/i.test(e.message);
      if (!refusedSummary) {
        // A refused effort (some models skip "none") must not stick to the thread.
        if (e instanceof OpenAI.BadRequestError && this.change) {
          this.input.splice(this.change.at, 1);
          this.effort = this.change.before;
          this.change = null;
        }
        throw e;
      }
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
        sink.step('thinking', '');
      } else if (ev.type === 'response.reasoning_summary_text.delta') {
        sink.step('thinking', ev.delta, true);
      } else if (ev.type === 'response.output_text.delta' || ev.type === 'response.refusal.delta') {
        if (commentary.has(ev.item_id)) sink.step('note', ev.delta, true);
        else sink.text(ev.delta);
      } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
        final = ev.response;
      } else if (ev.type === 'response.failed') {
        throw new Error(ev.response.error?.message ?? 'The response failed.');
      } else if (ev.type === 'error') {
        throw new Error(ev.message);
      }
    }
    if (!final) throw new Error('The stream ended without a response.');
    this.answered = true;
    this.change = null;
    this.input.push(...(final.output as unknown as ResponseInputItem[]));
    const calls = final.output.filter((o) => o.type === 'function_call');
    const usage = {
      cost: costOf(this.model, final.usage),
      input: final.usage?.input_tokens,
      cached: final.usage?.input_tokens_details?.cached_tokens,
      output: final.usage?.output_tokens,
      reasoning: final.usage?.output_tokens_details?.reasoning_tokens,
      cacheMiss:
        final.prompt_cache_diagnostics?.type === 'cache_miss' ? final.prompt_cache_diagnostics.reason : undefined,
    };
    if (final.status === 'incomplete') {
      // Answer any calls in the cut-short reply, or the thread's next request is rejected.
      this.addToolResults(calls.map((c) => ({ id: c.call_id, output: 'Not run: the reply was cut short.' })));
      const reason = final.incomplete_details?.reason ?? 'unknown reason';
      throw new CutShort(mentorError('cutShort', `The reply was cut short (${reason}).`, { reason }), usage);
    }
    return { calls: calls.map((c) => ({ id: c.call_id, name: c.name, args: c.arguments })), usage };
  }
}


export const openaiProvider: MentorProvider = {
  id: 'openai',
  name: 'OpenAI',
  keyPlaceholder: 'sk-…',
  defaultModel: DEFAULT_MODEL,
  suggestedModels: [DEFAULT_MODEL],
  efforts: EFFORTS,
  defaultEffort: 'medium',

  connect(key: string): Connection {
    const client = new OpenAI({ apiKey: key, maxRetries: 2, timeout: 300_000 });
    return {
      async listModels() {
        const check = new OpenAI({ apiKey: key, maxRetries: 1, timeout: 20_000 });
        const found: { id: string; created: number }[] = [];
        for await (const m of check.models.list()) if (isChatModel(m.id)) found.push({ id: m.id, created: m.created });
        found.sort((a, b) => b.created - a.created);
        const ids = found.map((m) => m.id);
        return [...openaiProvider.suggestedModels.filter((m) => ids.includes(m)), ...ids.filter((m) => !openaiProvider.suggestedModels.includes(m))];
      },
      conversation: (model, threadKey, saved) => new OpenAIConversation(client, model, threadKey, saved),
      voice: {
        create: (body) => client.live.create(body, { timeout: 30_000 }),
        attach: (sessionId) => new SidebandWS(client, { session_id: sessionId }),
        hangup: (sessionId) => client.live.sessions.hangup(sessionId, { timeout: 10_000 }),
        look: (body) => client.responses.create(body, { timeout: 20_000, maxRetries: 0 }),
      },
    };
  },

  friendly(e, model) {
    const provider = 'OpenAI';
    const m = model ?? 'that model';
    if (e instanceof OpenAI.APIUserAbortError) return mentorError('stopped', 'Stopped.');
    if (e instanceof OpenAI.APIConnectionError)
      return mentorError('offline', "Couldn't reach OpenAI. Check the internet connection.", { provider });
    if (e instanceof OpenAI.APIError) {
      if (e.status === 400 && /effort/.test(e.param ?? ''))
        return mentorError('effort', `${m} doesn't take that reasoning effort. Pick another one and send again.`, { model: m });
      if (e.status === 401) return mentorError('badKey', 'OpenAI rejected the key.', { provider });
      if (e.status === 403) return mentorError('noAccess', `This key isn't allowed to use ${m}.`, { model: m });
      if (e.status === 404) return mentorError('noModel', `OpenAI doesn't offer ${m} to this key.`, { provider, model: m });
      // An account with no credit left also answers 429, with its own code.
      if (e.status === 429 && e.code === 'insufficient_quota')
        return mentorError('noCredit', 'The OpenAI account is out of credit. Add some under Billing on platform.openai.com, then send again.', { provider, page: 'platform.openai.com' });
      if (e.status === 429)
        return mentorError('rateLimit', 'OpenAI said slow down (429). Wait a minute and send again.', { provider });
      if (e.status && e.status >= 500)
        return mentorError('busy', 'OpenAI is busy or having trouble right now. Try again in a minute.', { provider });
      return mentorError('other', scrub(`OpenAI refused the request (${e.status ?? '?'}): ${e.message}`));
    }
    return mentorError('other', scrub((e as Error)?.message ?? String(e)));
  },
};
