// Voice mode (GPT-Live), phase V0. The browser talks to OpenAI over WebRTC. This server creates the
// session with the learner's key, attaches to it over the sideband to run the mentor's tools, and
// keeps the transcript and the cost. The key never reaches the browser. See docs/mentor/PLAN.md,
// "Voice mode".
import type { Express } from 'express';
import type { LiveCreateParams } from 'openai/resources/live/live';
import type { SidebandWS } from 'openai/resources/live/sideband/ws';
import type { Response as OpenAIResponse } from 'openai/resources/responses/responses';
import type { Item } from '../content.js';
import { peekItem } from '../progress.js';
import { addDelta, cleanSpeech, finalTurns, type SpokenTurn } from '../../shared/transcript.js';
import { onActivity, type Activity } from './activity.js';
import { itemContext, progressNote } from './context.js';
import { MENTOR_INSTRUCTIONS, REACT_INSTRUCTIONS, VOICE_BACKEND_NOTE, VOICE_INSTRUCTIONS } from './prompt.js';
import { costOf, openaiProvider } from './providers/openai.js';
import { mentorError, scrub, type Connection, type MentorError, type VoiceLink } from './providers/types.js';
import type { DisplayMessage } from './threads.js';
import { runTool, toolSpecs, type MentorDeps, type ToolSpec } from './tools.js';

const VOICE_MODEL = process.env.FORGE_MENTOR_VOICE_MODEL ?? 'gpt-live-1';
const VOICE_USD_PER_MINUTE = 0.05;
/** A hard stop per call while voice is a spike, so a forgotten call can't run up the bill. */
const MAX_SECONDS = Number(process.env.FORGE_MENTOR_VOICE_MAX_SECONDS) || 3600;
/** Each time a call's cost passes another step of this, the panel asks whether to keep going. */
const SOFT_CAP_USD = Number(process.env.FORGE_MENTOR_VOICE_SOFT_CAP) || 2;
/** No answer to that question this long ends the call. */
const ASK_MS = Number(process.env.FORGE_MENTOR_VOICE_ASK_MS) || 60_000;
const IDLE_MS = 5 * 60_000;
/** The start `input` takes 8,192 tokens at most; about 3 characters a token keeps well under. */
const INPUT_CHARS = 20_000;
/** Reasoning efforts the delegation accepts. The text chat's "max" becomes "xhigh". */
const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
type Effort = (typeof EFFORTS)[number];
/** Finished calls stay readable this long, so the panel can show the final cost. */
const KEEP_MS = 10 * 60_000;
/** At most one nudge this often. */
const NUDGE_GAP_MS = Number(process.env.FORGE_MENTOR_NUDGE_GAP_MS) || 3 * 60_000;
/** Quiet this long on failing tests counts as stuck. */
const STUCK_MS = Number(process.env.FORGE_MENTOR_STUCK_MS) || 3 * 60_000;
/** A nudge waits until nobody has spoken for this long, and the learner hasn't saved for SAVE_QUIET_MS. */
const SPEECH_QUIET_MS = 4000;
const SAVE_QUIET_MS = 8000;
/**
 * The editor saves about once a second while the learner types. A note about saves goes out once
 * they pause this long, so it describes the finished edit, not a half-typed line...
 */
const SAVE_PAUSE_MS = 1500;
/** ...and no later than this after the first unsent save, for someone who types without pausing. */
const SAVE_MAX_WAIT_MS = 5000;
/** A context note may hold 500 tokens; this stays under it. */
const NOTE_CHARS = 1400;
const TICK_MS = 250;
/** At most one reaction to an edit this often. */
const REACT_GAP_MS = Number(process.env.FORGE_MENTOR_REACT_GAP_MS) || 40_000;
/** At most one glance this often, silent ones included; edits in between go into the next one. */
const GLANCE_GAP_MS = Number(process.env.FORGE_MENTOR_GLANCE_GAP_MS) || 12_000;
/** FORGE_MENTOR_VOICE_REACTIONS=0 turns reactions to edits off (nudges stay). */
const REACTIONS = process.env.FORGE_MENTOR_VOICE_REACTIONS !== '0';
/** A reaction is said only after this long with nobody speaking. */
const REACT_QUIET_MS = 2500;
/** No nudge this soon after a reaction, so the two don't pile up. */
const NUDGE_AFTER_REACT_MS = 20_000;
/** Whole files up to this size go to a glance; bigger ones only around the changes. */
const LOOK_FILE_CHARS = 12_000;
/** FORGE_MENTOR_VOICE_DEBUG=1 logs a timeline of each call (events and timings, never what was said). */
const DEBUG = process.env.FORGE_MENTOR_VOICE_DEBUG === '1';
/** FORGE_MENTOR_VOICE_TRACE=1, for experiments: every event type from OpenAI, errors, and what the mentor said. */
const TRACE = process.env.FORGE_MENTOR_VOICE_TRACE === '1';

/** What voice needs from the text mentor's routes. */
export interface VoiceHost {
  deps: MentorDeps;
  /** The OpenAI connection, or null without an OpenAI key. */
  openai(): Connection | null;
  /** The OpenAI model the text chat uses, which does the thinking behind the voice. */
  backendModel(): string;
  /** The last few messages of the item's OpenAI thread, so the call picks up where the chat left off. */
  recent(item: Item): DisplayMessage[];
  /** Saves the call's turns into the item's OpenAI thread. */
  saveTurns(item: Item, turns: DisplayMessage[]): void;
  /** Adds the call's cost to the session total in the settings. */
  spend(cost: number | null): void;
}

interface Call {
  id: string;
  item: Item;
  backend: string;
  link: VoiceLink;
  sideband: SidebandWS;
  /** Voice seconds billed so far: OpenAI sends running totals. */
  seconds: number;
  backendCost: number | null;
  turns: SpokenTurn[];
  /** Where each item's part of the call starts in `turns`, so each part is saved with its item. */
  parts: { item: Item; from: number }[];
  /** One line per tool run, like the text chat's tool lines. */
  tools: string[];
  /** The tools the session has now; read_reference joins when the gate opens. */
  sentTools: string[];
  /** Tool runs under way, by delegation, answered together when that response completes. */
  pending: Map<string, Promise<{ call_id: string; output: string }>[]>;
  ended: string | null;
  error: MentorError | null;
  lastSpeech: number;
  timer: ReturnType<typeof setInterval>;
  ctl: AbortController;
  saved: boolean;
  /** The cost at which the panel next asks whether to keep going. */
  capAt: number;
  /** When the panel started asking; the learner's microphone is muted meanwhile. */
  asking: number | null;
  // Following the learner (V1).
  /** The Nudges switch: off means the mentor only speaks when spoken to. */
  nudges: boolean;
  /** File contents as last seen, to say what a save changed. */
  files: Record<string, string>;
  /** Files saved since the last note about saves, with their content before. */
  saveBase: Map<string, string>;
  /** When the oldest unsent save came in. */
  saveSince: number;
  /** For the debug timeline. */
  started: number;
  delegations: Map<string, number>;
  /** Reactions to edits: the item context a glance starts from, and its state. */
  lookContext: string;
  looking: boolean;
  lastReaction: number;
  /** Counts saves, so a glance that a newer save overtook is dropped. */
  saveSeq: number;
  /** A backend response is under way; notes for the backend wait for it. */
  backendBusy: boolean;
  busySince: number;
  backendQueue: string[];
  /** File contents as of the last glance: the next one looks at everything changed since. */
  lookBase: Record<string, string>;
  /** A newer edit arrived during a glance: look again when it's done. */
  lookAgain: boolean;
  lastGlance: number;
  /** A reaction waiting for a quiet moment. */
  sayLater: { line: string; seq: number; until: number } | null;
  lastUser: number;
  lastMentor: number;
  lastSave: number;
  /** Anything the learner did or said. Quiet past STUCK_MS on failing tests counts as stuck. */
  lastActive: number;
  /** The last submit's first failing test, and whether the tests fail now. */
  failing: { name: string } | null;
  passed: number;
  stuckNudged: boolean;
  hintsInCall: number;
  passedAtFirstHint: number;
  section: string;
  /** Messages the learner typed during the call that the backend hasn't been asked yet. */
  typed: string[];
  /** A nudge waiting for a quiet moment. */
  nudge: { why: string; text: string } | null;
  lastNudge: number;
  /** What was sent, for the panel and the tests: context notes and nudges, newest last. */
  notes: { kind: 'context' | 'nudge' | 'reaction'; why: string; at: number }[];
}

const calls = new Map<string, Call>();

const voiceCost = (c: Call) => (c.seconds / 60) * VOICE_USD_PER_MINUTE;
const totalCost = (c: Call) => (c.backendCost === null ? null : voiceCost(c) + c.backendCost);

/** Voice only: the mentor can't read code aloud, so it puts a snippet in the learner's panel. */
const SHOW_CODE: ToolSpec = {
  name: 'show_code',
  description:
    "Put a short code snippet in the learner's chat panel, where they can read and copy it. Voice can't show code, so use this whenever code would help: when the learner asks to see code or the syntax, or the help rung you're on calls for it. Keep it to the lines that matter, then say out loud where it goes. Never use it for the whole solution before the reference unlocks.",
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'The code, at most about 30 lines.' },
      path: { type: ['string', 'null'], description: 'The file it belongs in, like models/Recipe.ts, or null.' },
      caption: { type: ['string', 'null'], description: 'One short line above the code, or null.' },
    },
    required: ['code', 'path', 'caption'],
    additionalProperties: false,
  },
};
const MAX_SNIPPET = 4000;
const LANGS: Record<string, string> = { ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', graphql: 'graphql', gql: 'graphql', json: 'json', css: 'css', html: 'html' };

function delegationTools(item: Item) {
  return [...toolSpecs(item), SHOW_CODE].map((s: ToolSpec) => ({
    type: 'function' as const,
    name: s.name,
    description: s.description,
    parameters: s.parameters,
    strict: true,
  }));
}

/** The item, progress and the end of the text chat, for the start of the call. */
function startContext(host: VoiceHost, item: Item, talk = false): string {
  const recent = host
    .recent(item)
    .filter((m) => m.text.trim())
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Learner' : 'Mentor'}: ${m.text.trim().slice(0, 600)}`);
  const parts = [
    itemContext(host.deps, item, { talk }),
    progressNote(item),
    recent.length ? `# The text chat so far (most recent last)\n${recent.join('\n\n')}` : '',
  ];
  let text = parts.filter(Boolean).join('\n\n');
  if (text.length > INPUT_CHARS) text = text.slice(0, INPUT_CHARS) + '\n… (cut; read files and lessons with tools)';
  return text;
}

/** The newest turn of this role that is speech, or undefined. */
const lastSpoken = (c: Call, role: 'user' | 'assistant') =>
  [...c.turns].reverse().find((t) => t.role === role && !t.kind);

function addSpeech(c: Call, role: 'user' | 'assistant', delta: string, start?: number, end?: number) {
  const before = c.turns.length;
  const heard = cleanSpeech(lastSpoken(c, role)?.text ?? '');
  addDelta(c.turns, role, delta, start, end);
  // A microphone near a keyboard hears typing, which comes through as "[typing]" and the like.
  // Only real words count as someone speaking.
  const words = cleanSpeech(lastSpoken(c, role)?.text ?? '');
  if (c.turns.length === before && words === heard) return;
  if (c.turns.length > before && !cleanSpeech(delta)) return;
  const now = Date.now();
  c.lastSpeech = now;
  if (role === 'user') {
    c.lastUser = now;
    c.lastActive = now;
    c.stuckNudged = false;
  } else c.lastMentor = now;
  if (c.turns.length > before) dbg(c, `${role === 'user' ? 'learner' : 'mentor'} speaking`);
}

/** show_code: the snippet joins the call's turns, so it lands in the thread where it was shown. */
function showCode(c: Call, raw: string): { output: string; label: string } {
  let args: { code?: unknown; path?: unknown; caption?: unknown };
  try {
    args = JSON.parse(raw || '{}');
  } catch {
    return { output: 'Error: the arguments were not valid JSON.', label: '' };
  }
  const code = typeof args.code === 'string' ? args.code.replace(/\s+$/, '') : '';
  if (!code.trim()) return { output: 'Error: no code given.', label: '' };
  if (code.length > MAX_SNIPPET) return { output: `Error: too long (${code.length} characters). Show only the lines that matter.`, label: '' };
  const path = typeof args.path === 'string' ? args.path.trim() : '';
  const caption = typeof args.caption === 'string' ? args.caption.trim() : '';
  const lang = LANGS[path.split('.').pop() ?? ''] ?? 'ts';
  const head = [caption, path ? `\`${path}\`` : ''].filter(Boolean).join(' · ');
  const fence = '```';
  c.turns.push({ role: 'assistant', kind: 'code', text: `${head ? head + '\n\n' : ''}${fence}${lang}\n${code}\n${fence}` });
  return { output: 'Shown in the panel. Now tell the learner briefly where it goes; do not read it aloud.', label: path ? `Showed code for ${path}` : 'Showed code' };
}

async function runCall(host: VoiceHost, c: Call, item: { call_id: string; name: string; arguments: string }) {
  const t0 = Date.now();
  dbg(c, `tool ${item.name} called`);
  try {
    const outcome =
      item.name === 'show_code'
        ? showCode(c, item.arguments)
        : await runTool(host.deps, c.item, item.name, item.arguments ?? '{}', c.ctl.signal);
    if (outcome.label) c.tools.push(outcome.label);
    dbg(c, `tool ${item.name} done in ${Date.now() - t0} ms`);
    return { call_id: item.call_id, output: outcome.output };
  } catch (e) {
    return { call_id: item.call_id, output: `The tool failed: ${scrub((e as Error).message)}` };
  }
}

/** Answers every tool call of a finished backend response, then lets the backend carry on. */
async function answerCalls(c: Call, delegation: string) {
  const runs = c.pending.get(delegation);
  c.pending.delete(delegation);
  if (!runs?.length || c.ended) return;
  const results = await Promise.all(runs);
  if (c.ended) return;
  updateTools(c);
  for (const r of results) {
    c.sideband.send({ type: 'response.item.create', item: { type: 'function_call_output', call_id: r.call_id, output: r.output } });
  }
  c.sideband.send({ type: 'response.create' });
}

function trace(c: Call, ev: { type: string; [k: string]: unknown }) {
  if (!TRACE || ev.type === 'session.output_audio.delta' || ev.type === 'session.input_audio.append') return;
  const inner = ev.type === 'response.event' ? ` > ${(ev.event as { type?: string })?.type}` : '';
  const err = ev.type === 'error' ? ` ${scrub(JSON.stringify(ev.error))}` : '';
  const innerEv = ev.event as { type?: string; text?: string } | undefined;
  const said = ev.type.endsWith('transcript.delta')
    ? ` "${String(ev.delta)}"`
    : innerEv?.type === 'response.output_text.done'
      ? ` backend wrote "${innerEv.text}"`
      : '';
  if (ev.type === 'response.event' && innerEv?.type?.includes('.delta')) return;
  const ack = typeof ev.client_event_id === 'string' ? ` (ack ${ev.client_event_id})` : '';
  console.log(`[trace ${c.id.slice(-6)} +${((Date.now() - c.started) / 1000).toFixed(1)}s] ${ev.type}${inner}${err}${said}${ack}`);
}

function onEvent(host: VoiceHost, c: Call, ev: { type: string; [k: string]: unknown }) {
  trace(c, ev);
  switch (ev.type) {
    case 'session.input_transcript.delta':
      return addSpeech(c, 'user', String(ev.delta ?? ''), ev.start_ms as number, ev.end_ms as number);
    case 'session.output_transcript.delta':
      return addSpeech(c, 'assistant', String(ev.delta ?? ''), ev.start_ms as number, ev.end_ms as number);
    case 'session.usage.updated': {
      c.seconds = Math.max(c.seconds, Number((ev.usage as { seconds?: number })?.seconds ?? 0));
      if (c.seconds >= MAX_SECONDS) void end(host, c, 'limit');
      else checkCap(c);
      return;
    }
    case 'response.event': {
      const inner = ev.event as { type?: string; item?: Record<string, unknown>; response?: OpenAIResponse };
      const delegation = String(ev.delegation_id ?? 'session');
      if (inner?.type === 'response.created') {
        c.backendBusy = true;
        c.busySince = Date.now();
      }
      if (inner?.type === 'response.output_item.done' && inner.item?.type === 'function_call') {
        const call = inner.item as { call_id: string; name: string; arguments: string };
        const runs = c.pending.get(delegation) ?? [];
        runs.push(runCall(host, c, call));
        c.pending.set(delegation, runs);
      } else if (
        inner?.type === 'response.completed' ||
        inner?.type === 'response.incomplete' ||
        inner?.type === 'response.cancelled' ||
        inner?.type === 'response.failed'
      ) {
        const usage = inner.response?.usage;
        const since = c.delegations.get(delegation);
        dbg(c, `backend ${inner.type.slice(9)}${since ? ` ${Date.now() - since} ms into the delegation` : ''}, ${usage?.input_tokens ?? '?'} in (${usage?.input_tokens_details?.cached_tokens ?? 0} cached) / ${usage?.output_tokens ?? '?'} out`);
        if (usage) {
          const cost = costOf(c.backend, usage);
          c.backendCost = cost === null || c.backendCost === null ? null : c.backendCost + cost;
          checkCap(c);
        }
        if (inner.type === 'response.failed') {
          c.error = mentorError('other', scrub(inner.response?.error?.message ?? 'The backend model failed.'));
          console.warn('[mentor voice] backend failed:', c.error.text);
        }
        // Done unless tool calls are waiting: their answers start the next response.
        if (!c.pending.get(delegation)?.length) {
          c.backendBusy = false;
          for (const text of c.backendQueue.splice(0)) tellBackend(c, text);
          askTyped(c);
        }
        void answerCalls(c, delegation);
      }
      return;
    }
    case 'session.delegation.created': {
      const d = ev.delegation as { id?: string } | undefined;
      if (d?.id) c.delegations.set(d.id, Date.now());
      dbg(c, 'delegation started');
      return;
    }
    case 'session.closed': {
      c.seconds = Math.max(c.seconds, Number((ev.usage as { seconds?: number })?.seconds ?? 0));
      return finish(host, c, String(ev.reason ?? 'closed'));
    }
    case 'error': {
      c.error = callError(ev.error as { code?: string; message?: string } | undefined);
      console.warn('[mentor voice]', c.error.code, c.error.text);
      return;
    }
  }
}

/** An error event from the call, in the panel's words where there are any. */
function callError(err: { code?: string; message?: string } | undefined): MentorError {
  const provider = 'OpenAI';
  const code = err?.code ?? '';
  if (/insufficient_quota|billing/.test(code))
    return mentorError('noCredit', 'The OpenAI account is out of credit. Add some under Billing on platform.openai.com, then send again.', { provider, page: 'platform.openai.com' });
  if (/invalid_api_key|unauthorized|authentication/.test(code)) return mentorError('badKey', 'OpenAI rejected the key.', { provider });
  if (/rate_limit/.test(code)) return mentorError('rateLimit', 'OpenAI said slow down (429). Wait a minute and send again.', { provider });
  if (/server_error|overloaded|unavailable/.test(code))
    return mentorError('busy', 'OpenAI is busy or having trouble right now. Try again in a minute.', { provider });
  return mentorError('other', scrub(`${code || 'error'}: ${err?.message ?? ''}`));
}

/** Past the next step of the soft cap: stop listening and let the panel ask whether to go on. */
function checkCap(c: Call) {
  const cost = c.backendCost === null ? voiceCost(c) : voiceCost(c) + c.backendCost;
  if (c.ended || c.asking || cost < c.capAt) return;
  c.asking = Date.now();
  c.sideband.send({ type: 'session.input_audio.mute' });
}

/** The reference tool appears once the learner passes or submits 3 times, as in the text chat. */
function updateTools(c: Call) {
  const now = delegationTools(c.item);
  const names = now.map((t) => t.name);
  if (names.join() === c.sentTools.join()) return;
  c.sentTools = names;
  c.sideband.send({ type: 'session.update', session: { delegation: { type: 'responses', responses: { tools: now } } } });
}

/** The longest typed message a call takes. */
const MAX_TYPED = 4000;

/** One line of the debug timeline: what happened when, never what was said. */
function dbg(c: Call, what: string) {
  if (DEBUG) console.log(`[voice ${c.id.slice(-6)} +${((Date.now() - c.started) / 1000).toFixed(1)}s] ${what}`);
}

/** Private context for the call: never spoken, it tells the mentor what the learner just did. */
function note(c: Call, why: string, text: string) {
  if (c.ended) return;
  const content = text.length > NOTE_CHARS ? text.slice(0, NOTE_CHARS) + ' …' : text;
  c.sideband.send({ type: 'session.thinking.append', delegation_id: null, content: `Update: ${content}` });
  c.notes.push({ kind: 'context', why, at: Date.now() });
  dbg(c, `note ${why} (${content.length} chars)`);
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

/** "models/Recipe.ts: lines 6-7 changed (+1 line). Now line 7: `tags: …`" */
function describeSave(path: string, before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const { added, removed } = changedLines(a, b);
  const delta = b.length - a.length;
  const size = delta ? ` (${delta > 0 ? '+' : ''}${delta} line${Math.abs(delta) === 1 ? '' : 's'})` : '';
  if (!added.length) {
    return removed ? `${path}: ${removed} line${removed === 1 ? '' : 's'} removed.` : `${path}: saved, no line changed.`;
  }
  // 1-based line numbers, as ranges: "5", "5-7, 28".
  const ranges: string[] = [];
  for (let i = 0; i < added.length; i++) {
    let j = i;
    while (j + 1 < added.length && added[j + 1] === added[j] + 1) j++;
    ranges.push(j > i ? `${added[i] + 1}-${added[j] + 1}` : `${added[i] + 1}`);
    i = j;
  }
  const where = added.length === 1 ? `line ${ranges[0]}` : `lines ${ranges.join(', ')}`;
  const shown = added
    .filter((i) => b[i].trim())
    .slice(0, 6)
    .map((i) => `line ${i + 1}: \`${clip(b[i].trim(), 120)}\``)
    .join('; ');
  const more = added.filter((i) => b[i].trim()).length > 6 ? ' …' : '';
  return `${path}: ${where} changed${size}.${shown ? ' Now ' + shown + more + '.' : ''}`;
}

/**
 * Which lines of `b` are new or changed compared with `a` (0-based), and how many of `a` went away.
 * A plain longest-common-subsequence diff over the part between the unchanged top and bottom.
 */
function changedLines(a: string[], b: string[]): { added: number[]; removed: number } {
  let top = 0;
  while (top < a.length && top < b.length && a[top] === b[top]) top++;
  let end = 0;
  while (end < a.length - top && end < b.length - top && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const A = a.slice(top, a.length - end);
  const B = b.slice(top, b.length - end);
  const n = A.length;
  const m = B.length;
  // A whole-file rewrite isn't worth a big table: call every line changed.
  if (n * m > 4_000_000) return { added: B.map((_, j) => top + j), removed: n };
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const added: number[] = [];
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) {
      removed++;
      i++;
    } else added.push(top + j++);
  }
  removed += n - i;
  while (j < m) added.push(top + j++);
  return { added, removed };
}

interface Edit {
  path: string;
  before: string;
  after: string;
}

/** Lines of `after`, numbered, with changed ones marked *; only around the changes unless `whole`. */
function marked(e: Edit, whole: boolean, max = 2500): string {
  const b = e.after.split('\n');
  const added = new Set(changedLines(e.before.split('\n'), b).added);
  const keep = new Set<number>();
  if (whole) b.forEach((_, i) => keep.add(i));
  else for (const i of added) for (let k = Math.max(0, i - 2); k <= Math.min(b.length - 1, i + 2); k++) keep.add(k);
  const lines: string[] = [];
  let prev = -2;
  for (const i of [...keep].sort((x, y) => x - y)) {
    if (i !== prev + 1 && lines.length) lines.push('     …');
    lines.push(`${String(i + 1).padStart(4)}${added.has(i) ? '*' : ' '} ${b[i]}`);
    prev = i;
  }
  const text = lines.join('\n');
  return text.length > max ? text.slice(0, max) + '\n     …' : text;
}

function flushSaves(c: Call) {
  if (!c.saveBase.size) return;
  const edits: Edit[] = [...c.saveBase].map(([path, before]) => ({ path, before, after: c.files[path] ?? '' }));
  const summary = edits.map((e) => describeSave(e.path, e.before, e.after)).join(' ');
  dbg(c, `saves summed up ${Date.now() - c.saveSince} ms after the first, ${Date.now() - c.lastSave} ms after the last`);
  c.saveBase.clear();
  note(c, 'save', `(background only, don't comment) The learner saved. ${summary}`);
  // The backend gets the changed lines too, so a question about them needs no read_file round.
  const shown = edits.map((e) => `${e.path} (changed lines marked *):\n${marked(e, false)}`);
  tellBackend(c, `Update: the learner just saved.\n${shown.join('\n\n')}`);
  void react(c);
}

/** A note for the backend's conversation. While it is answering, notes wait, so they never land mid-turn. */
function tellBackend(c: Call, text: string, eventId?: string) {
  if (c.ended) return;
  if (backendBusy(c)) return void c.backendQueue.push(text);
  // Notes that waited behind a response that never reported its end go first.
  for (const waiting of [...c.backendQueue.splice(0), text]) {
    c.sideband.send({ type: 'response.item.create', event_id: eventId, item: { type: 'message', role: 'developer', content: waiting } });
  }
}

/**
 * A message the learner typed during the call. It joins the transcript as their turn, and the
 * backend answers it like a spoken question: GPT-Live says the answer.
 */
function typedMessage(c: Call, text: string) {
  const now = Date.now();
  c.turns.push({ role: 'user', kind: 'typed', text });
  c.lastSpeech = c.lastUser = c.lastActive = now;
  c.stuckNudged = false;
  c.nudge = null;
  c.sayLater = null;
  c.typed.push(text);
  note(c, 'typed', `The learner typed this in the chat instead of saying it: "${text}". Treat it as said to you. The answer is being worked out and will arrive for you to say; don't answer it yourself.`);
  askTyped(c);
}

/** Hands waiting typed messages to the backend and asks for its answer, once it is free. */
function askTyped(c: Call) {
  if (c.ended || !c.typed.length || backendBusy(c)) return;
  for (const waiting of c.backendQueue.splice(0)) {
    c.sideband.send({ type: 'response.item.create', item: { type: 'message', role: 'developer', content: waiting } });
  }
  for (const text of c.typed.splice(0)) {
    c.sideband.send({
      type: 'response.item.create',
      item: { type: 'message', role: 'user', content: `(Typed in the chat during the call, not spoken.)\n${text}` },
    });
  }
  c.sideband.send({ type: 'response.create' });
  c.backendBusy = true;
  c.busySince = Date.now();
  dbg(c, 'typed message sent to the backend');
}

/**
 * The backend is answering. A response the learner interrupts may never report its end, so the
 * flag expires 20 s after the response started.
 */
function backendBusy(c: Call, now = Date.now()) {
  if (c.backendBusy && now - c.busySince >= 20_000) c.backendBusy = false;
  return c.backendBusy;
}

/** Nobody has spoken for `ms`, and the backend isn't answering. */
function quietFor(c: Call, ms: number, now = Date.now()) {
  return now - c.lastUser >= ms && now - c.lastMentor >= ms && !backendBusy(c, now);
}

/** Say a reaction now. */
function sayReaction(c: Call, line: string) {
  const t = Date.now();
  c.sideband.send({ type: 'session.commentary.append', delegation_id: null, content: line });
  c.lastReaction = t;
  c.notes.push({ kind: 'reaction', why: 'edit', at: t });
  dbg(c, 'reaction said');
}

/**
 * A glance at what the learner changed since the last glance, outside the call: the backend says
 * one short line or "(silent)", and the server has GPT-Live say the line when it's quiet.
 * Off with the Nudges switch.
 */
async function react(c: Call, force = false) {
  const now = Date.now();
  if (!REACTIONS || !c.nudges || c.ended || c.asking) return;
  if (c.looking) return void (c.lookAgain = true);
  if (!force && (now - c.lastGlance < GLANCE_GAP_MS || now - c.lastReaction < REACT_GAP_MS || now - c.lastNudge < NUDGE_AFTER_REACT_MS)) {
    // Not now: the tick looks at everything changed since, once the gaps allow.
    return void (c.lookAgain = true);
  }
  const edits: Edit[] = Object.keys(c.files)
    .filter((path) => (c.lookBase[path] ?? '') !== c.files[path])
    .map((path) => ({ path, before: c.lookBase[path] ?? '', after: c.files[path] }));
  // Blank lines and removals alone aren't worth a look.
  const real = edits.filter((e) => {
    const b = e.after.split('\n');
    return changedLines(e.before.split('\n'), b).added.some((i) => b[i].trim());
  });
  c.lookAgain = false;
  if (!real.length) return;
  c.looking = true;
  c.lastGlance = now;
  const seq = c.saveSeq;
  let overtaken = false;
  try {
    const spoken = finalTurns(c.turns)
      .filter((t) => !t.kind)
      .slice(-6)
      .map((t) => `${t.role === 'user' ? 'Learner' : 'Mentor'}: ${t.text}`)
      .join('\n');
    const tests = c.failing
      ? `Tests: failing, ${c.passed} passing. First failure: ${c.failing.name}`
      : 'Tests: none failing, or not submitted yet.';
    const summary = real.map((e) => describeSave(e.path, e.before, e.after)).join(' ');
    const files = real.map(
      (e) => `${e.path} now (lines changed since your last look marked *):\n${marked(e, e.after.length <= LOOK_FILE_CHARS, LOOK_FILE_CHARS)}`,
    );
    const resp = await c.link.look({
      model: c.backend,
      instructions: REACT_INSTRUCTIONS,
      input: [
        { role: 'developer', content: c.lookContext },
        {
          role: 'developer',
          content: [tests, spoken ? `What was said lately:\n${spoken}` : '', `Changed since your last look: ${summary}`, ...files]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      reasoning: { effort: 'low' },
      max_output_tokens: 800,
      store: false,
      prompt_cache_key: 'forge-voice-look:' + c.id,
    });
    const cost = costOf(c.backend, resp.usage);
    c.backendCost = cost === null || c.backendCost === null ? null : c.backendCost + cost;
    const line = (resp.output_text ?? '').trim();
    const silent = !line || /^\(?silent\)?\.?$/i.test(line) || line.length > 220;
    const u = resp.usage;
    dbg(
      c,
      `glance in ${Date.now() - now} ms: ${silent ? 'silent' : 'has a line'}; ${u?.input_tokens ?? '?'} in (${u?.input_tokens_details?.cached_tokens ?? 0} cached) / ${u?.output_tokens ?? '?'} out, $${(cost ?? 0).toFixed(4)}`,
    );
    if (seq !== c.saveSeq) {
      // The learner kept typing: this look is out of date. Look again at the newest code.
      overtaken = true;
      dbg(c, 'glance overtaken by a newer edit');
      return;
    }
    for (const e of real) c.lookBase[e.path] = e.after;
    if (silent || c.ended || c.asking || !c.nudges) return;
    if (quietFor(c, REACT_QUIET_MS)) sayReaction(c, line);
    else {
      c.sayLater = { line, seq, until: Date.now() + 8000 };
      dbg(c, 'reaction waits for a quiet moment');
    }
  } catch (e) {
    dbg(c, `glance failed: ${scrub((e as Error).message)}`);
  } finally {
    c.looking = false;
    // The tick looks again at the newest code once the glance gap allows.
    if (overtaken) c.lookAgain = true;
  }
}

function queueNudge(c: Call, why: string, text: string) {
  if (c.nudges) c.nudge = { why, text };
}

/** Follows the learner's activity for the item the call is about. */
function follow(host: VoiceHost, c: Call, a: Activity) {
  if (c.ended) return;
  const now = Date.now();
  if (a.type === 'open') {
    if (a.item.key === c.item.key) return;
    c.item = a.item;
    c.parts.push({ item: a.item, from: c.turns.length });
    c.lookContext = `${itemContext(host.deps, a.item)}\n\n${progressNote(a.item)}`;
    c.files = a.item.kind === 'lesson' ? {} : { ...host.deps.taskFiles(a.item) };
    c.lookBase = { ...c.files };
    c.sayLater = null;
    c.saveBase.clear();
    c.failing = null;
    c.passed = 0;
    c.hintsInCall = 0;
    c.stuckNudged = false;
    c.nudge = null;
    c.section = '';
    c.lastActive = now;
    const what =
      a.item.kind === 'lesson'
        ? `the lesson "${a.item.title}" (key ${a.item.key}). Read it with read_lesson when it matters.`
        : `the exercise "${a.item.title}" (key ${a.item.key}). Its instructions start: ${clip(a.item.instructions.replace(/\s+/g, ' '), 600)} Read its files and run its tests with the tools.`;
    note(c, 'open', `The learner moved on to ${what} Earlier notes were about the previous item.`);
    updateTools(c);
    return;
  }
  if (a.item.key !== c.item.key) return;
  // Anything else the learner does comes after their edits, so the edits go first.
  if (a.type !== 'save') flushSaves(c);
  c.lastActive = now;
  c.stuckNudged = false;
  switch (a.type) {
    case 'save': {
      c.lastSave = now;
      c.saveSeq++;
      for (const [path, content] of Object.entries(a.files)) {
        if (typeof content !== 'string' || c.files[path] === content) continue;
        if (!c.saveBase.size) c.saveSince = now;
        if (!c.saveBase.has(path)) c.saveBase.set(path, c.files[path] ?? '');
        c.files[path] = content;
      }
      // The tick sends the note once the learner pauses typing.
      return;
    }
    case 'run': {
      const out = a.out;
      const last = out.logs.at(-1);
      const how = out.crashed
        ? `it crashed: ${clip(out.crashed.message, 300)}`
        : out.compileErrors?.length
          ? `it didn't compile: ${clip(`${out.compileErrors[0].file}:${out.compileErrors[0].line} ${out.compileErrors[0].text}`, 300)}`
          : `it printed ${out.logs.length} line${out.logs.length === 1 ? '' : 's'}${last ? `, the last: ${clip(JSON.stringify(last), 200)}` : ''}`;
      note(c, 'run', `The learner ran the playground; ${how}.`);
      return;
    }
    case 'submit': {
      const out = a.out;
      const passed = out.results.filter((r) => r.passed).length;
      const fail = out.results.find((r) => !r.passed);
      if (out.ok) {
        note(c, 'submit', `The learner submitted (attempt ${a.attempts}) and all ${out.results.length} tests passed. The exercise is done.`);
        c.failing = null;
        c.nudge = null;
      } else {
        const why = fail
          ? `First failing test: "${clip(fail.name, 120)}"${fail.message ? `: ${clip(fail.message, 300)}` : ''}`
          : out.compileErrors?.length
            ? `It didn't compile: ${clip(out.compileErrors[0].text, 300)}`
            : out.crashed
              ? `It crashed: ${clip(out.crashed.message, 300)}`
              : 'The run failed.';
        note(c, 'submit', `The learner submitted (attempt ${a.attempts}): ${passed} of ${out.results.length} tests passed. ${why}`);
        const name = fail?.name ?? why;
        if (c.failing?.name === name) {
          queueNudge(
            c,
            'same-test',
            `I see the "${clip(fail?.name ?? 'same', 80)}" test failed again. Want to talk through what it expects?`,
          );
        }
        c.failing = { name };
      }
      c.passed = passed;
      updateTools(c);
      return;
    }
    case 'hint': {
      note(c, 'hint', `The learner opened hint ${a.shown} of ${a.total}, so they can now see it: ${clip(a.text, 500)}`);
      c.hintsInCall++;
      if (c.hintsInCall === 1) c.passedAtFirstHint = c.passed;
      else if (c.passed <= c.passedAtFirstHint) {
        queueNudge(c, 'hints', "That's a couple of hints now. Want to go through the next step together?");
      }
      return;
    }
    case 'solution':
      note(c, 'solution', 'The learner opened the reference solution.');
      updateTools(c);
      return;
  }
}

/** Once a second: sums up saves, notices a stuck learner, and lets a waiting nudge out when it's quiet. */
function tick(host: VoiceHost, c: Call) {
  const now = Date.now();
  if (c.asking) {
    if (now - c.asking > ASK_MS) void end(host, c, 'cap');
    return;
  }
  // Idle means nobody spoke and the learner did nothing in the app: quiet coding keeps the call.
  if (now - Math.max(c.lastSpeech, c.lastActive) > IDLE_MS) return void end(host, c, 'idle');
  if (c.saveBase.size && (now - c.lastSave >= SAVE_PAUSE_MS || now - c.saveSince >= SAVE_MAX_WAIT_MS)) flushSaves(c);
  // A glance put off by a gap, or overtaken by an edit: once the gaps allow and typing has paused.
  if (
    c.lookAgain &&
    !c.looking &&
    now - c.lastSave >= SAVE_PAUSE_MS &&
    now - c.lastGlance >= GLANCE_GAP_MS &&
    now - c.lastReaction >= REACT_GAP_MS &&
    now - c.lastNudge >= NUDGE_AFTER_REACT_MS
  ) {
    void react(c);
  }
  if (c.sayLater) {
    const later = c.sayLater;
    if (later.seq !== c.saveSeq || now > later.until || !c.nudges) {
      c.sayLater = null;
      dbg(c, `waiting reaction dropped: ${later.seq !== c.saveSeq ? 'newer edit' : 'no quiet moment'}`);
    } else if (quietFor(c, REACT_QUIET_MS, now)) {
      c.sayLater = null;
      sayReaction(c, later.line);
    }
  }
  // Stuck is the vaguest reason, so it never replaces a nudge that is already waiting.
  if (c.failing && !c.stuckNudged && !c.nudge && now - c.lastActive >= STUCK_MS) {
    c.stuckNudged = true;
    queueNudge(c, 'stuck', "You've been on this one a few minutes and the tests still fail. Want a pointer on where to look?");
  }
  const quiet =
    now - c.lastUser >= SPEECH_QUIET_MS && now - c.lastMentor >= SPEECH_QUIET_MS && now - c.lastSave >= SAVE_QUIET_MS;
  if (c.nudge && c.nudges && quiet && now - c.lastNudge >= NUDGE_GAP_MS && now - c.lastReaction >= NUDGE_AFTER_REACT_MS) {
    c.sideband.send({ type: 'session.commentary.append', delegation_id: null, content: c.nudge.text });
    c.notes.push({ kind: 'nudge', why: c.nudge.why, at: now });
    dbg(c, `nudge ${c.nudge.why}`);
    c.lastNudge = now;
    c.nudge = null;
    // The stuck clock starts again from a check-in.
    c.lastActive = now;
    c.stuckNudged = false;
  }
}

/** Saves the call once: its turns into the thread, its cost into the session total. */
function finish(host: VoiceHost, c: Call, reason: string) {
  if (!c.ended) c.ended = reason;
  clearInterval(c.timer);
  c.ctl.abort();
  try {
    c.sideband.close();
  } catch {
    /* already closed */
  }
  if (c.saved) return;
  c.saved = true;
  // Each item's part of the call goes into that item's thread. The call's cost sits on the last
  // thing the mentor said.
  const saved = c.parts
    .map((p, i) => ({
      item: p.item,
      turns: finalTurns(c.turns.slice(p.from, c.parts[i + 1]?.from)).map(
        (t): DisplayMessage => ({ role: t.role, text: t.text.trim(), voice: true }),
      ),
    }))
    .filter((p) => p.turns.length);
  const last = saved
    .flatMap((p) => p.turns)
    .reverse()
    .find((t) => t.role === 'assistant');
  if (last) {
    last.model = `${VOICE_MODEL} + ${c.backend}`;
    last.cost = totalCost(c);
  }
  for (const p of saved) host.saveTurns(p.item, p.turns);
  host.spend(totalCost(c));
  setTimeout(() => calls.delete(c.id), KEEP_MS).unref();
}

/** Asks OpenAI to close the call, and hangs up if it doesn't answer in a few seconds. */
async function end(host: VoiceHost, c: Call, reason: string) {
  if (c.ended) return;
  c.ended = reason;
  try {
    c.sideband.send({ type: 'session.close' });
  } catch {
    /* the socket is gone; the hangup below still ends the call */
  }
  setTimeout(() => {
    if (c.saved) return;
    c.link.hangup(c.id).catch(() => {});
    finish(host, c, reason);
  }, 4000).unref();
}

function view(c: Call) {
  return {
    id: c.id,
    seconds: c.seconds,
    maxSeconds: MAX_SECONDS,
    voiceCost: voiceCost(c),
    backendCost: c.backendCost,
    cost: totalCost(c),
    backend: c.backend,
    tools: c.tools,
    /** Snippets shown so far, in order, for the panel during the call. */
    codes: c.turns.filter((t) => t.kind === 'code').map((t) => t.text),
    ended: c.ended,
    error: c.error,
    nudges: c.nudges,
    notes: c.notes,
    /** Set while the panel should ask whether to keep going: the cost it passed. */
    capAsk: c.asking && !c.ended ? c.capAt : null,
    capAt: c.capAt,
    askSeconds: Math.round(ASK_MS / 1000),
  };
}

export function mountVoice(app: Express, host: VoiceHost) {
  onActivity((a) => {
    for (const c of calls.values()) follow(host, c, a);
  });

  const fail = (res: import('express').Response, status: number, err: MentorError) =>
    void res.status(status).json({ error: err.text, code: err.code, ...(err.vars ? { vars: err.vars } : {}) });

  app.post('/api/mentor/voice/session', async (req, res) => {
    const item = host.deps.curriculum().byKey.get(String(req.body?.itemKey ?? ''));
    if (!item) return fail(res, 404, mentorError('openItem', 'Open a lesson or exercise first.'));
    const sdp = typeof req.body?.sdp === 'string' ? req.body.sdp : '';
    if (!sdp.startsWith('v=0') || sdp.length > 50_000) return fail(res, 400, mentorError('badSdp', 'The browser sent a bad call offer.'));
    const link = host.openai()?.voice;
    if (!link) return fail(res, 400, mentorError('noVoiceKey', 'Voice needs an OpenAI key.'));
    // One learner, one call: a call left behind by a reloaded or closed page is ended, not in the way.
    for (const old of calls.values()) if (!old.ended) void end(host, old, 'replaced');

    const nudges = req.body?.nudges !== false;
    const backend = host.backendModel();
    const wanted = req.body?.effort === 'max' ? 'xhigh' : req.body?.effort;
    const effort: Effort = (EFFORTS as readonly string[]).includes(wanted) ? wanted : 'medium';
    const tools = delegationTools(item);
    const context = startContext(host, item);
    // The voice model gets no hints and no code: anything about the code goes through the backend.
    const talkContext = startContext(host, item, true);
    const session: LiveCreateParams['session'] = {
      model: VOICE_MODEL,
      instructions: VOICE_INSTRUCTIONS,
      audio: { output: { voice: 'marin' } },
      input: [{ role: 'developer', content: [{ type: 'input_text', text: talkContext }] }],
      delegation: {
        type: 'responses',
        responses: {
          model: backend,
          // The backend may not see the call's start input, so it gets the item context too.
          instructions: `${MENTOR_INSTRUCTIONS}${VOICE_BACKEND_NOTE}\n\n${context}`,
          reasoning: { effort },
          tools,
          tool_choice: 'auto',
        },
      },
    };

    let created;
    try {
      created = await link.create({ session, transport: { type: 'webrtc', sdp } });
    } catch (e) {
      return fail(res, 502, openaiProvider.friendly(e, VOICE_MODEL));
    }
    const id = created.session.id;
    let sideband: SidebandWS;
    try {
      sideband = link.attach(id);
    } catch (e) {
      link.hangup(id).catch(() => {});
      return fail(res, 502, openaiProvider.friendly(e, VOICE_MODEL));
    }
    const c: Call = {
      id,
      item,
      backend,
      link,
      sideband,
      seconds: 0,
      backendCost: 0,
      turns: [],
      parts: [{ item, from: 0 }],
      tools: [],
      sentTools: tools.map((t) => t.name),
      pending: new Map(),
      ended: null,
      error: null,
      lastSpeech: Date.now(),
      timer: setInterval(() => tick(host, c), TICK_MS),
      ctl: new AbortController(),
      saved: false,
      capAt: SOFT_CAP_USD,
      asking: null,
      nudges,
      files: item.kind === 'lesson' ? {} : { ...host.deps.taskFiles(item) },
      saveBase: new Map(),
      saveSince: 0,
      started: Date.now(),
      delegations: new Map(),
      lookContext: context,
      looking: false,
      lastReaction: 0,
      saveSeq: 0,
      backendBusy: false,
      busySince: 0,
      backendQueue: [],
      typed: [],
      lookBase: {},
      lookAgain: false,
      lastGlance: 0,
      sayLater: null,
      lastUser: 0,
      lastMentor: 0,
      lastSave: 0,
      lastActive: Date.now(),
      failing: null,
      passed: 0,
      stuckNudged: false,
      hintsInCall: 0,
      passedAtFirstHint: 0,
      section: '',
      nudge: null,
      lastNudge: 0,
      notes: [],
    };
    // Tests that already failed before the call count, so a stuck learner gets a nudge too.
    const last = peekItem(item.key)?.lastResult;
    if (item.kind !== 'lesson' && last && last.passed < last.total) {
      c.failing = { name: 'an earlier submit' };
      c.passed = last.passed;
    }
    c.lookBase = { ...c.files };
    calls.set(id, c);
    sideband.on('event', (ev) => onEvent(host, c, ev as { type: string }));
    sideband.on('error', (e) => {
      // Errors from OpenAI arrive here too; a socket failure is logged without its details.
      const text = scrub(e.error?.error?.message ?? e.message ?? 'sideband error');
      console.warn('[mentor voice] sideband:', text);
      if (!c.error) c.error = mentorError('other', text);
    });
    sideband.on('close', () => {
      if (!c.saved) finish(host, c, c.ended ?? 'connection_lost');
    });
    res.json({ id, sdp: created.transport.sdp, maxSeconds: MAX_SECONDS, backend, voiceModel: VOICE_MODEL });
  });

  app.get('/api/mentor/voice/session', (req, res) => {
    const c = calls.get(String(req.query.id ?? ''));
    if (!c) return fail(res, 404, mentorError('noCall', 'No such call.'));
    res.json(view(c));
  });

  /** What only the browser knows: the lesson section in view, and what the learner types. */
  app.post('/api/mentor/voice/event', (req, res) => {
    const c = calls.get(String(req.body?.id ?? ''));
    if (!c || c.ended) return fail(res, 404, mentorError('noCall', 'No such call.'));
    if (req.body?.type === 'typed') {
      const text = typeof req.body.text === 'string' ? req.body.text.trim().slice(0, MAX_TYPED) : '';
      // While the cost question is up the call isn't listening, so nothing would be said back.
      if (text && !c.asking) typedMessage(c, text);
      return void res.json({ ok: !!text && !c.asking });
    }
    const heading = typeof req.body?.heading === 'string' ? req.body.heading.trim().slice(0, 200) : '';
    if (req.body?.type === 'section' && heading && heading !== c.section && c.item.kind === 'lesson') {
      c.section = heading;
      c.lastActive = Date.now();
      note(c, 'section', `The learner is now reading the section "${heading}" of the lesson.`);
    }
    res.json({ ok: true });
  });

  /** The Nudges switch. Off drops any nudge still waiting. */
  // Experiments only, with FORGE_MENTOR_VOICE_DEBUG=1: trigger server-side messages to the backend.
  if (DEBUG) {
    app.post('/api/mentor/voice/debug', async (req, res) => {
      const c = calls.get(String(req.body?.id ?? ''));
      if (!c || c.ended) return fail(res, 404, mentorError('noCall', 'No such call.'));
      const text = String(req.body?.text ?? '');
      if (req.body?.op === 'tell') tellBackend(c, text, 'exp_tell');
      else if (req.body?.op === 'react') void react(c, true);
      else if (req.body?.op === 'speak') {
        // A scripted learner line, as audio the test page plays into the call.
        try {
          const wav = await c.link.speech(text);
          dbg(c, `debug speak (${wav.length} bytes)`);
          return void res.json({ wav: wav.toString('base64') });
        } catch (e) {
          return fail(res, 502, mentorError('other', scrub((e as Error).message)));
        }
      }
      else if (req.body?.op === 'commentary') c.sideband.send({ type: 'session.commentary.append', delegation_id: null, content: text, event_id: 'exp_comm' });
      dbg(c, `debug ${req.body?.op}`);
      res.json({ ok: true });
    });
  }

  app.post('/api/mentor/voice/nudges', (req, res) => {
    const c = calls.get(String(req.body?.id ?? ''));
    if (!c) return fail(res, 404, mentorError('noCall', 'No such call.'));
    c.nudges = req.body?.on === true;
    if (!c.nudges) c.nudge = null;
    res.json(view(c));
  });

  /** "Keep going" past the soft cap: listen again, and ask next at the following step. */
  app.post('/api/mentor/voice/continue', (req, res) => {
    const c = calls.get(String(req.body?.id ?? ''));
    if (!c || c.ended) return fail(res, 404, mentorError('noCall', 'No such call.'));
    if (c.asking) {
      c.asking = null;
      c.capAt += SOFT_CAP_USD;
      c.lastSpeech = Date.now();
      c.sideband.send({ type: 'session.input_audio.unmute' });
    }
    res.json(view(c));
  });

  app.post('/api/mentor/voice/end', async (req, res) => {
    const c = calls.get(String(req.body?.id ?? ''));
    if (!c) return fail(res, 404, mentorError('noCall', 'No such call.'));
    await end(host, c, 'close_requested');
    res.json(view(c));
  });
}
