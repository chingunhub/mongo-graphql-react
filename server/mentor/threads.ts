// Mentor conversations on disk: one JSON file per provider and thread, in DATA_DIR/mentor/threads.
// Never part of progress.json or the progress export. The key is never in them: a saved thread
// holds the messages and tool results only.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../paths.js';

const DIR = join(DATA_DIR, 'mentor', 'threads');
const VERSION = 1;

export type StepKind = 'thinking' | 'note' | 'tool';

export interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  steps?: { kind: StepKind; text: string }[];
  effort?: string;
  model?: string;
  /** USD; null when the model's price isn't known or the reply was stopped. */
  cost?: number | null;
  error?: string;
  /** The error's code and vars, so the panel shows it in the learner's language. See MentorError. */
  errorCode?: string;
  errorVars?: Record<string, string>;
  /** On a learner message in a project thread: the step they had moved on to, by title. */
  moved?: string;
  /** Said out loud in a voice call, not typed. */
  voice?: boolean;
  /** On a voice turn: already passed on to the text chat's model. */
  fed?: boolean;
}

export interface SavedThread {
  version: typeof VERSION;
  provider: string;
  scope: string;
  model: string | null;
  display: DisplayMessage[];
  lastNote: string;
  lastItem: string;
  /** Item context actually supplied to the text model; absent in older saved threads. */
  contextItem?: string;
  /** What the provider's Conversation.save() returned. */
  state: unknown;
}

const fileOf = (provider: string, scope: string) =>
  join(DIR, `${provider}--${scope.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);

export function loadThread(provider: string, scope: string): SavedThread | null {
  try {
    const s = JSON.parse(readFileSync(fileOf(provider, scope), 'utf8'));
    return s?.version === VERSION && s.provider === provider && s.scope === scope && Array.isArray(s.display) ? s : null;
  } catch {
    return null;
  }
}

export function writeThread(s: Omit<SavedThread, 'version'>) {
  mkdirSync(DIR, { recursive: true });
  const file = fileOf(s.provider, s.scope);
  writeFileSync(file + '.tmp', JSON.stringify({ version: VERSION, ...s }));
  renameSync(file + '.tmp', file);
}

export function removeThread(provider: string, scope: string) {
  rmSync(fileOf(provider, scope), { force: true });
}

/** Deletes every saved conversation. Keys are stored elsewhere and stay. */
export function removeAllThreads() {
  rmSync(DIR, { recursive: true, force: true });
}
