// Anthropic through the Messages API, with a manual tool loop the routes drive.
import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlockParam,
  MessageParam,
  TextBlockParam,
  ToolResultBlockParam,
  Usage,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { MENTOR_INSTRUCTIONS } from '../prompt.js';
import { TOOL_SPECS } from '../tools.js';
import {
  CutShort,
  scrub,
  usd,
  type Connection,
  type Conversation,
  type MentorProvider,
  type Price,
  type RoundResult,
  type RoundUsage,
  type Sink,
  type Turn,
} from './types.js';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORTS)[number];
const MAX_TOKENS = 32_000;

/**
 * USD per million tokens (Anthropic pricing, 2026-11-09). Cache writes cost 1.25x input.
 * Haiku 5.5 bills prompts over 100K tokens at a higher rate, so it has two rows.
 */
const PRICES: { re: RegExp; overInput?: number; price: Price; over?: Price }[] = [
  { re: /^claude-opus-5-5/, price: { input: 4, cached: 0.2, cacheWrite: 5, output: 20 } },
  { re: /^claude-sonnet-5-5/, price: { input: 2, cached: 0.2, cacheWrite: 2.5, output: 10 } },
  {
    re: /^claude-haiku-5-5/,
    overInput: 100_000,
    price: { input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5 },
    over: { input: 0.5, cached: 0.05, cacheWrite: 0.625, output: 2.5 },
  },
];

function costOf(model: string, u: Usage): number | null {
  const row = PRICES.find((p) => p.re.test(model));
  if (!row) return null;
  const read = u.cache_read_input_tokens ?? 0;
  const written = u.cache_creation_input_tokens ?? 0;
  const prompt = u.input_tokens + read + written;
  const p = row.over && row.overInput && prompt > row.overInput ? row.over : row.price;
  return usd(u.input_tokens, p.input) + usd(read, p.cached) + usd(written, p.cacheWrite) + usd(u.output_tokens, p.output);
}

/**
 * Models that take a role "system" message inside messages. Others get the note as a text block
 * in the user turn. Haiku 5.5 is left out: Anthropic's pages disagree on whether it takes one.
 */
const takesSystemMessages = (model: string) => /^claude-(opus-5|sonnet-5-5|fable-5|mythos-5|opus-4-8)/.test(model);

const text = (t: string): TextBlockParam => ({ type: 'text', text: t });

class AnthropicConversation implements Conversation {
  private messages: MessageParam[] = [];
  /** Answers for tool calls in a reply that was cut short or refused, sent with the next turn. */
  private pending: ToolResultBlockParam[] = [];
  private effort: Effort = 'medium';

  constructor(
    private client: Anthropic,
    readonly model: string,
  ) {}

  addTurn({ context, note, message, effort }: Turn) {
    this.effort = (EFFORTS as readonly string[]).includes(effort) ? (effort as Effort) : 'medium';
    const blocks: ContentBlockParam[] = [...this.pending];
    this.pending = [];
    // A stopped turn leaves the history ending without a reply. Fold that tail into this turn:
    // nothing before it changes, and a system message must be followed by an assistant turn.
    let start = this.messages.length;
    while (start > 0 && this.messages[start - 1].role !== 'assistant') start--;
    for (const m of this.messages.splice(start)) {
      if (m.role === 'system') {
        const body = typeof m.content === 'string' ? m.content : m.content.map((b) => b.text).join('\n');
        blocks.push(text(`<progress_note>\n${body}\n</progress_note>`));
      } else blocks.push(...(typeof m.content === 'string' ? [text(m.content)] : m.content));
    }
    if (context) blocks.push(text(`<item_context>\n${context}\n</item_context>`));
    const asSystem = note && takesSystemMessages(this.model) && !context;
    if (note && !asSystem) blocks.push(text(`<progress_note>\n${note}\n</progress_note>`));
    blocks.push(text(message));
    this.messages.push({ role: 'user', content: blocks });
    // Placed after the user turn, it reads as the operator's word and leaves the cached history alone.
    if (asSystem) this.messages.push({ role: 'system', content: note });
  }

  addToolResults(results: { id: string; output: string }[]) {
    this.messages.push({
      role: 'user',
      content: results.map((r) => ({ type: 'tool_result' as const, tool_use_id: r.id, content: r.output })),
    });
  }

  size() {
    return JSON.stringify(this.messages).length;
  }

  async round(sink: Sink, signal: AbortSignal): Promise<RoundResult> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: MENTOR_INSTRUCTIONS, cache_control: { type: 'ephemeral' } }],
        // Also cache the conversation so far, up to its last block.
        cache_control: { type: 'ephemeral' },
        messages: this.messages,
        tools: TOOL_SPECS.map((s) => ({
          name: s.name,
          description: s.description,
          input_schema: s.parameters as Anthropic.Tool['input_schema'],
          strict: true,
        })),
        tool_choice: { type: 'auto' },
        // Summaries are off by default on the 5.5 models; the steps list shows them.
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: this.effort },
      },
      { signal },
    );
    for await (const ev of stream) {
      if (ev.type === 'content_block_start' && ev.content_block.type === 'thinking') sink.step('thinking', '');
      else if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'thinking_delta') sink.step('thinking', ev.delta.thinking, true);
        else if (ev.delta.type === 'text_delta') sink.text(ev.delta.text);
      }
    }
    const msg = await stream.finalMessage();
    // Sent back exactly as it came: thinking blocks are tied to this conversation.
    this.messages.push({ role: 'assistant', content: msg.content });
    const calls = msg.content.filter((b) => b.type === 'tool_use');
    const usage: RoundUsage = {
      cost: costOf(this.model, msg.usage),
      input: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0),
      cached: msg.usage.cache_read_input_tokens ?? 0,
      output: msg.usage.output_tokens,
    };
    const stop = msg.stop_reason;
    if (stop === 'refusal' || stop === 'max_tokens' || stop === 'model_context_window_exceeded') {
      // Never run the tools of a refused or cut-short reply, but answer them so the thread stays valid.
      this.pending = calls.map((c) => ({ type: 'tool_result', tool_use_id: c.id, content: 'Not run.', is_error: true }));
      if (stop === 'refusal') {
        const why = msg.stop_details?.explanation;
        throw new CutShort(scrub(`The model declined to continue${why ? `: ${why}` : '.'}`), usage);
      }
      if (stop === 'model_context_window_exceeded') {
        throw new CutShort('This conversation is too long. Start a new one.', usage);
      }
      throw new CutShort('The reply was cut short (it hit the length limit).', usage);
    }
    return { calls: calls.map((c) => ({ id: c.id, name: c.name, args: JSON.stringify(c.input ?? {}) })), usage };
  }
}

export const anthropicProvider: MentorProvider = {
  id: 'anthropic',
  name: 'Anthropic',
  keyPlaceholder: 'sk-ant-…',
  defaultModel: 'claude-sonnet-5-5',
  suggestedModels: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  efforts: EFFORTS,
  defaultEffort: 'medium',

  connect(key: string): Connection {
    const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 300_000 });
    return {
      async listModels() {
        const check = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 20_000 });
        const found: { id: string; created: string }[] = [];
        for await (const m of check.models.list()) {
          if (m.id.startsWith('claude-')) found.push({ id: m.id, created: m.created_at });
        }
        found.sort((a, b) => b.created.localeCompare(a.created));
        const ids = found.map((m) => m.id);
        const top = anthropicProvider.suggestedModels.filter((m) => ids.includes(m));
        return [...top, ...ids.filter((m) => !top.includes(m))];
      },
      conversation: (model) => new AnthropicConversation(client, model),
    };
  },

  friendly(e, model) {
    if (e instanceof Anthropic.APIUserAbortError) return 'Stopped.';
    if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check the internet connection.";
    if (e instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the key.';
    if (e instanceof Anthropic.PermissionDeniedError) return `This key isn't allowed to use ${model ?? 'that model'}.`;
    if (e instanceof Anthropic.NotFoundError) return `Anthropic doesn't offer ${model ?? 'that model'} to this key.`;
    if (e instanceof Anthropic.RateLimitError)
      return 'Anthropic said slow down (429). Wait a minute, or check the limits on the Anthropic Console.';
    if (e instanceof Anthropic.APIError) {
      if (e.status === 529 || (e.status && e.status >= 500))
        return 'Anthropic is busy or having trouble right now. Try again in a minute.';
      return scrub(`Anthropic refused the request (${e.status ?? '?'}): ${e.message}`);
    }
    return scrub((e as Error)?.message ?? String(e));
  },
};
