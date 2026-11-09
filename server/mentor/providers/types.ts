// What the routes need from a model provider. The routes own the tool loop, the threads and
// the stream to the browser; a provider owns its SDK, its request shape and its prices.
import type { LiveCreateParams, LiveCreateResponse } from 'openai/resources/live/live';
import type { SidebandWS } from 'openai/resources/live/sideband/ws';
import type { Response as OpenAIResponse, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type { ToolSpec } from '../tools.js';

/** What happened on the way to an answer, in order: thinking summaries, progress notes, tool calls. */
export type StepKind = 'thinking' | 'note' | 'tool';

export interface Sink {
  /** Answer text, streamed as it arrives. */
  text(delta: string): void;
  /** A step line; append adds to the last step of the same kind. */
  step(kind: StepKind, text: string, append?: boolean): void;
}

export interface ToolCall {
  id: string;
  name: string;
  /** JSON text, as tools.ts runTool expects. */
  args: string;
}

export interface RoundUsage {
  /** USD for this round, or null when the model's price is unknown. */
  cost: number | null;
  input?: number;
  cached?: number;
  output?: number;
  reasoning?: number;
  /** Why the provider says the cache missed, when it says so. */
  cacheMiss?: string;
}

export interface RoundResult {
  calls: ToolCall[];
  usage: RoundUsage;
}

export interface Turn {
  /** The open item's context, sent once at the start of a thread. */
  context?: string;
  /** A fresh progress note, sent when it changed since the last turn. */
  note?: string;
  message: string;
  effort: string;
}

/** One chat thread's provider-side history. */
export interface Conversation {
  readonly model: string;
  addTurn(turn: Turn): void;
  /**
   * One request: streams into the sink, appends the reply to the history, returns its tool calls.
   * The tools come from the routes each round, since read_reference joins once the gate opens.
   */
  round(sink: Sink, signal: AbortSignal, tools: ToolSpec[]): Promise<RoundResult>;
  addToolResults(results: { id: string; output: string }[]): void;
  /** Rough size of the history in characters, for the input cap. */
  size(): number;
  /** The history as plain JSON, so the thread can be saved to disk. Never holds the key. */
  save(): unknown;
}

/** A provider with a key in hand. */
export interface Connection {
  /** Chat models this key can use, best first. Also proves the key works. */
  listModels(): Promise<string[]>;
  /** A new conversation, or one picked up from what save() returned. */
  conversation(model: string, threadKey: string, saved?: unknown): Conversation;
  /** Voice sessions (GPT-Live), OpenAI only. The key stays inside, like everywhere else. */
  voice?: VoiceLink;
}

/** What voice.ts needs from the OpenAI SDK, with the learner's key already in it. */
export interface VoiceLink {
  create(body: LiveCreateParams): Promise<LiveCreateResponse>;
  /** The server's own connection to a running session: tool calls, transcripts, usage. */
  attach(sessionId: string): SidebandWS;
  hangup(sessionId: string): Promise<void>;
  /** One short request outside the call, for a glance at the learner's edit. */
  look(body: ResponseCreateParamsNonStreaming): Promise<OpenAIResponse>;
  /** Text to speech, for scripted test calls only (FORGE_MENTOR_VOICE_DEBUG=1). WAV bytes. */
  speech(text: string): Promise<Buffer>;
}

export interface MentorProvider {
  id: ProviderId;
  name: string;
  /** Shown in the key field. */
  keyPlaceholder: string;
  defaultModel: string;
  /** Offered before the key is checked, and kept at the top of the list after. */
  suggestedModels: string[];
  efforts: readonly string[];
  defaultEffort: string;
  connect(key: string): Connection;
  /** A message safe to show the learner. Never the provider's raw auth error, which can echo the key. */
  friendly(e: unknown, model?: string): MentorError;
}

/**
 * An error the panel can show in the learner's language. The panel looks up mentor.err.<code>
 * and fills it from vars; text is the English, shown when there is no string for the code.
 * Code "other" carries a provider's own words, which only exist in English.
 */
export interface MentorError {
  code: string;
  text: string;
  vars?: Record<string, string>;
}

export const mentorError = (code: string, text: string, vars?: Record<string, string>): MentorError => ({
  code,
  text,
  ...(vars ? { vars } : {}),
});

export type ProviderId = 'anthropic' | 'openai';

export const scrub = (s: string) => s.replace(/sk-[A-Za-z0-9_*\-]{6,}/g, '[key]');

/** USD per million tokens. */
export interface Price {
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
}

export const usd = (tokens: number, perMillion: number) => (tokens * perMillion) / 1e6;

/** A round that failed after it was billed (cut short, refused), so the routes still count its cost. */
export class CutShort extends Error {
  constructor(
    readonly error: MentorError,
    readonly usage: RoundUsage,
  ) {
    super(error.text);
  }
}

/** An error the routes raise themselves, already in the learner-facing shape. */
export class Coded extends Error {
  constructor(readonly error: MentorError) {
    super(error.text);
  }
}
