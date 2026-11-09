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
import { onActivity, type Activity } from './activity.js';
import { itemContext, progressNote } from './context.js';
import { MENTOR_INSTRUCTIONS, VOICE_BACKEND_NOTE, VOICE_INSTRUCTIONS } from './prompt.js';
import { costOf, openaiProvider } from './providers/openai.js';
import { mentorError, scrub, type Connection, type MentorError, type VoiceLink } from './providers/types.js';
import type { DisplayMessage } from './threads.js';
import { runTool, toolSpecs, type MentorDeps, type ToolSpec } from './tools.js';

const VOICE_MODEL = process.env.FORGE_MENTOR_VOICE_MODEL ?? 'gpt-live-1';
const VOICE_USD_PER_MINUTE = 0.05;
/** A hard stop per call while voice is a spike, so a forgotten call can't run up the bill. */
const MAX_SECONDS = Number(process.env.FORGE_MENTOR_VOICE_MAX_SECONDS) || 600;
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
/** Saves to one file are summed up at most this often, so typing doesn't flood the call. */
const SAVE_EVERY_MS = 10_000;
/** A context note may hold 500 tokens; this stays under it. */
const NOTE_CHARS = 1400;
const TICK_MS = 1000;

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
  turns: { role: 'user' | 'assistant'; text: string }[];
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
  // Following the learner (V1).
  /** The Nudges switch: off means the mentor only speaks when spoken to. */
  nudges: boolean;
  /** File contents as last seen, to say what a save changed. */
  files: Record<string, string>;
  /** Files saved since the last note about saves, with their content before. */
  saveBase: Map<string, string>;
  lastSaveNote: number;
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
  /** A nudge waiting for a quiet moment. */
  nudge: { why: string; text: string } | null;
  lastNudge: number;
  /** What was sent, for the panel and the tests: context notes and nudges, newest last. */
  notes: { kind: 'context' | 'nudge'; why: string; at: number }[];
}

const calls = new Map<string, Call>();

const voiceCost = (c: Call) => (c.seconds / 60) * VOICE_USD_PER_MINUTE;
const totalCost = (c: Call) => (c.backendCost === null ? null : voiceCost(c) + c.backendCost);

function delegationTools(item: Item) {
  return toolSpecs(item).map((s: ToolSpec) => ({
    type: 'function' as const,
    name: s.name,
    description: s.description,
    parameters: s.parameters,
    strict: true,
  }));
}

/** The item, progress and the end of the text chat, for the start of the call. */
function startContext(host: VoiceHost, item: Item): string {
  const recent = host
    .recent(item)
    .filter((m) => m.text.trim())
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Learner' : 'Mentor'}: ${m.text.trim().slice(0, 600)}`);
  const parts = [
    itemContext(host.deps, item),
    progressNote(item),
    recent.length ? `# The text chat so far (most recent last)\n${recent.join('\n\n')}` : '',
  ];
  let text = parts.filter(Boolean).join('\n\n');
  if (text.length > INPUT_CHARS) text = text.slice(0, INPUT_CHARS) + '\n… (cut; read files and lessons with tools)';
  return text;
}

function addSpeech(c: Call, role: 'user' | 'assistant', delta: string) {
  const now = Date.now();
  c.lastSpeech = now;
  if (role === 'user') {
    c.lastUser = now;
    c.lastActive = now;
    c.stuckNudged = false;
  } else c.lastMentor = now;
  const last = c.turns.at(-1);
  if (last?.role === role) last.text += delta;
  else c.turns.push({ role, text: delta });
}

async function runCall(host: VoiceHost, c: Call, item: { call_id: string; name: string; arguments: string }) {
  try {
    const outcome = await runTool(host.deps, c.item, item.name, item.arguments ?? '{}', c.ctl.signal);
    if (outcome.label) c.tools.push(outcome.label);
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

function onEvent(host: VoiceHost, c: Call, ev: { type: string; [k: string]: unknown }) {
  switch (ev.type) {
    case 'session.input_transcript.delta':
      return addSpeech(c, 'user', String(ev.delta ?? ''));
    case 'session.output_transcript.delta':
      return addSpeech(c, 'assistant', String(ev.delta ?? ''));
    case 'session.usage.updated': {
      c.seconds = Math.max(c.seconds, Number((ev.usage as { seconds?: number })?.seconds ?? 0));
      if (c.seconds >= MAX_SECONDS) void end(host, c, 'cap');
      return;
    }
    case 'response.event': {
      const inner = ev.event as { type?: string; item?: Record<string, unknown>; response?: OpenAIResponse };
      const delegation = String(ev.delegation_id ?? 'session');
      if (inner?.type === 'response.output_item.done' && inner.item?.type === 'function_call') {
        const call = inner.item as { call_id: string; name: string; arguments: string };
        const runs = c.pending.get(delegation) ?? [];
        runs.push(runCall(host, c, call));
        c.pending.set(delegation, runs);
      } else if (
        inner?.type === 'response.completed' ||
        inner?.type === 'response.incomplete' ||
        inner?.type === 'response.failed'
      ) {
        const usage = inner.response?.usage;
        if (usage) {
          const cost = costOf(c.backend, usage);
          c.backendCost = cost === null || c.backendCost === null ? null : c.backendCost + cost;
        }
        if (inner.type === 'response.failed') {
          c.error = mentorError('other', scrub(inner.response?.error?.message ?? 'The backend model failed.'));
          console.warn('[mentor voice] backend failed:', c.error.text);
        }
        void answerCalls(c, delegation);
      }
      return;
    }
    case 'session.closed': {
      c.seconds = Math.max(c.seconds, Number((ev.usage as { seconds?: number })?.seconds ?? 0));
      return finish(host, c, String(ev.reason ?? 'closed'));
    }
    case 'error': {
      const err = ev.error as { code?: string; message?: string } | undefined;
      c.error = mentorError('other', scrub(`${err?.code ?? 'error'}: ${err?.message ?? ''}`));
      console.warn('[mentor voice]', c.error.text);
      return;
    }
  }
}

/** The reference tool appears once the learner passes or submits 3 times, as in the text chat. */
function updateTools(c: Call) {
  const now = delegationTools(c.item);
  const names = now.map((t) => t.name);
  if (names.join() === c.sentTools.join()) return;
  c.sentTools = names;
  c.sideband.send({ type: 'session.update', session: { delegation: { type: 'responses', responses: { tools: now } } } });
}

/** Private context for the call: never spoken, it tells the mentor what the learner just did. */
function note(c: Call, why: string, text: string) {
  if (c.ended) return;
  const content = text.length > NOTE_CHARS ? text.slice(0, NOTE_CHARS) + ' …' : text;
  c.sideband.send({ type: 'session.thinking.append', delegation_id: null, content: `Update: ${content}` });
  c.notes.push({ kind: 'context', why, at: Date.now() });
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

/** "models/Recipe.ts: lines 6-7 changed (+1 line). Now line 7: `tags: …`" */
function describeSave(path: string, before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  let top = 0;
  while (top < a.length && top < b.length && a[top] === b[top]) top++;
  let end = 0;
  while (end < a.length - top && end < b.length - top && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const from = top + 1;
  const to = b.length - end;
  const delta = b.length - a.length;
  const where = to >= from ? (to > from ? `lines ${from}-${to}` : `line ${from}`) : `around line ${from}`;
  const size = delta ? ` (${delta > 0 ? '+' : ''}${delta} line${Math.abs(delta) === 1 ? '' : 's'})` : '';
  const shown = b
    .slice(top, Math.min(to, top + 2))
    .map((l, i) => `line ${from + i}: \`${clip(l.trim(), 120)}\``)
    .join('; ');
  return `${path}: ${where} changed${size}.${shown ? ' Now ' + shown + '.' : ''}`;
}

function flushSaves(c: Call) {
  if (!c.saveBase.size) return;
  const parts = [...c.saveBase].map(([path, before]) => describeSave(path, before, c.files[path] ?? ''));
  c.saveBase.clear();
  c.lastSaveNote = Date.now();
  note(c, 'save', `The learner saved. ${parts.join(' ')}`);
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
    c.files = a.item.kind === 'lesson' ? {} : { ...host.deps.taskFiles(a.item) };
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
  c.lastActive = now;
  c.stuckNudged = false;
  switch (a.type) {
    case 'save': {
      c.lastSave = now;
      for (const [path, content] of Object.entries(a.files)) {
        if (typeof content !== 'string' || c.files[path] === content) continue;
        if (!c.saveBase.has(path)) c.saveBase.set(path, c.files[path] ?? '');
        c.files[path] = content;
      }
      // The first save after a while goes out at once; the rest are summed up by the tick.
      if (now - c.lastSaveNote >= SAVE_EVERY_MS) flushSaves(c);
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
  if (now - c.lastSpeech > IDLE_MS) return void end(host, c, 'idle');
  if (c.saveBase.size && now - c.lastSaveNote >= SAVE_EVERY_MS) flushSaves(c);
  // Stuck is the vaguest reason, so it never replaces a nudge that is already waiting.
  if (c.failing && !c.stuckNudged && !c.nudge && now - c.lastActive >= STUCK_MS) {
    c.stuckNudged = true;
    queueNudge(c, 'stuck', "You've been on this one a few minutes and the tests still fail. Want a pointer on where to look?");
  }
  const quiet =
    now - c.lastUser >= SPEECH_QUIET_MS && now - c.lastMentor >= SPEECH_QUIET_MS && now - c.lastSave >= SAVE_QUIET_MS;
  if (c.nudge && c.nudges && quiet && now - c.lastNudge >= NUDGE_GAP_MS) {
    c.sideband.send({ type: 'session.commentary.append', delegation_id: null, content: c.nudge.text });
    c.notes.push({ kind: 'nudge', why: c.nudge.why, at: now });
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
  const turns: DisplayMessage[] = c.turns
    .filter((t) => t.text.trim())
    .map((t) => ({ role: t.role, text: t.text.trim(), voice: true }));
  const last = [...turns].reverse().find((t) => t.role === 'assistant');
  if (last) {
    last.model = `${VOICE_MODEL} + ${c.backend}`;
    last.cost = totalCost(c);
  }
  if (turns.length) host.saveTurns(c.item, turns);
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
    ended: c.ended,
    error: c.error,
    nudges: c.nudges,
    notes: c.notes,
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
    if ([...calls.values()].some((c) => !c.ended)) return fail(res, 409, mentorError('voiceBusy', 'A voice call is already running.'));

    const nudges = req.body?.nudges !== false;
    const backend = host.backendModel();
    const wanted = req.body?.effort === 'max' ? 'xhigh' : req.body?.effort;
    const effort: Effort = (EFFORTS as readonly string[]).includes(wanted) ? wanted : 'medium';
    const tools = delegationTools(item);
    const context = startContext(host, item);
    const session: LiveCreateParams['session'] = {
      model: VOICE_MODEL,
      instructions: VOICE_INSTRUCTIONS,
      audio: { output: { voice: 'marin' } },
      input: [{ role: 'developer', content: [{ type: 'input_text', text: context }] }],
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
      tools: [],
      sentTools: tools.map((t) => t.name),
      pending: new Map(),
      ended: null,
      error: null,
      lastSpeech: Date.now(),
      timer: setInterval(() => tick(host, c), TICK_MS),
      ctl: new AbortController(),
      saved: false,
      nudges,
      files: item.kind === 'lesson' ? {} : { ...host.deps.taskFiles(item) },
      saveBase: new Map(),
      lastSaveNote: 0,
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

  /** What only the browser knows: the lesson section in view. */
  app.post('/api/mentor/voice/event', (req, res) => {
    const c = calls.get(String(req.body?.id ?? ''));
    if (!c || c.ended) return fail(res, 404, mentorError('noCall', 'No such call.'));
    const heading = typeof req.body?.heading === 'string' ? req.body.heading.trim().slice(0, 200) : '';
    if (req.body?.type === 'section' && heading && heading !== c.section && c.item.kind === 'lesson') {
      c.section = heading;
      c.lastActive = Date.now();
      note(c, 'section', `The learner is now reading the section "${heading}" of the lesson.`);
    }
    res.json({ ok: true });
  });

  /** The Nudges switch. Off drops any nudge still waiting. */
  app.post('/api/mentor/voice/nudges', (req, res) => {
    const c = calls.get(String(req.body?.id ?? ''));
    if (!c) return fail(res, 404, mentorError('noCall', 'No such call.'));
    c.nudges = req.body?.on === true;
    if (!c.nudges) c.nudge = null;
    res.json(view(c));
  });

  app.post('/api/mentor/voice/end', async (req, res) => {
    const c = calls.get(String(req.body?.id ?? ''));
    if (!c) return fail(res, 404, mentorError('noCall', 'No such call.'));
    await end(host, c, 'close_requested');
    res.json(view(c));
  });
}
