import type { Language } from '../../shared/languages';
import type { TaskforgeStage } from '../../shared/taskforge';

export type Files = Record<string, string>;

export interface ItemSummary {
  kind: 'lesson' | 'drill' | 'forge' | 'bughunt';
  key: string;
  id: string;
  title: string;
  minutes?: number;
  done?: boolean;
  summary?: string;
  workspace?: string;
  step?: number;
  status?: 'new' | 'started' | 'passed';
  locked?: boolean;
}

export interface ModuleSummary {
  id: string;
  number: number;
  title: string;
  part: string;
  stage: number;
  summary: string;
  items: ItemSummary[];
}

export interface CurriculumData {
  modules: ModuleSummary[];
  lastVisited?: string;
  settings: { unlockAll: boolean; language?: Language };
}

export interface LessonData extends ItemSummary {
  body: string;
}

export interface TaskData extends ItemSummary {
  env: 'node' | 'dom';
  instructions: string;
  focus: string[];
  readonly: string[];
  preview: boolean;
  files: Files;
  hints: string[];
  hintCount: number;
  needs: { key: string; title: string }[];
  attempts: number;
  lastResult?: { passed: number; total: number; at: string };
  solutionAvailable: boolean;
  solutionRevealed: boolean;
}

export type ReviewCard =
  | { kind: 'quiz'; id: string; due: string; source: string; lesson: { key: string; title: string } }
  | { kind: 'drill'; id: string; due: string; key: string; title: string; summary: string };

export interface ReviewSession {
  cards: ReviewCard[];
  gapDays: number;
}

export interface LogLine {
  level: string;
  text: string;
  test?: string;
}
export interface TestResult {
  name: string;
  passed: boolean;
  ms: number;
  message?: string;
  stack?: string;
  hint?: string;
}
export interface CompileError {
  file: string;
  line: number;
  column: number;
  text: string;
  lineText?: string;
}
export interface RunOutput {
  mode: 'run' | 'test';
  ok: boolean;
  logs: LogLine[];
  results: TestResult[];
  compileErrors?: CompileError[];
  crashed?: { phase: string; message: string; stack?: string } | null;
  timedOut?: boolean;
  ms: number;
  firstPass?: boolean;
  attempts?: number;
  solutionAvailable?: boolean;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `${res.status} ${res.statusText}`);
  return json as T;
}

const itemUrl = (key: string) => `/api/items/${key}`;

export const api = {
  relaydeskSource: (kind: 'mine' | 'reference') =>
    call<{ entries: ProjectFile[] }>('GET', '/api/relaydesk/' + kind + '/source'),
  relaydeskFile: (kind: 'mine' | 'reference', path: string) =>
    call<{ path: string; content: string }>(
      'GET',
      '/api/relaydesk/' + kind + '/source/file?path=' + encodeURIComponent(path),
    ),
  relaydesk: () =>
    call<{
      services: Record<'mine' | 'reference', RelaydeskService>;
      progress: { passed: number; total: number; complete: boolean };
    }>('GET', '/api/relaydesk'),
  startRelaydesk: (kind: 'mine' | 'reference', redis = false) =>
    call<RelaydeskService>('POST', '/api/relaydesk/' + kind + '/start', {
      redis,
    }),
  stopRelaydesk: (kind: 'mine' | 'reference') =>
    call<RelaydeskService>('POST', '/api/relaydesk/' + kind + '/stop'),
  exportRelaydesk: (kind: 'mine' | 'reference') =>
    call<{ directory: string; mode: string; complete: boolean }>(
      'POST',
      '/api/relaydesk/' + kind + '/export',
    ),

  curriculum: () => call<CurriculumData>('GET', '/api/curriculum'),
  item: <T>(key: string) => call<T>('GET', itemUrl(key)),
  completeLesson: (key: string) => call('POST', `${itemUrl(key)}/complete`),
  save: (key: string, files: Files) => call('POST', `${itemUrl(key)}/save`, { files }),
  run: (key: string, files: Files) => call<RunOutput>('POST', `${itemUrl(key)}/run`, { files }),
  submit: (key: string, files: Files) => call<RunOutput>('POST', `${itemUrl(key)}/submit`, { files }),
  hint: (key: string) => call<{ hints: string[] }>('POST', `${itemUrl(key)}/hint`),
  solution: (key: string) => call<{ files: Files }>('POST', `${itemUrl(key)}/solution`),
  reset: (key: string, path: string) =>
    call<{ path: string; content: string }>('POST', `${itemUrl(key)}/reset`, {
      path,
    }),
  preview: (key: string, files: Files) =>
    call<{ ok: boolean; url: string; compileErrors?: CompileError[] }>('POST', `${itemUrl(key)}/preview`, {
      files,
    }),
  settings: (s: Partial<CurriculumData['settings']>) => call('PUT', '/api/settings', s),
  review: () => call<ReviewSession>('GET', '/api/review'),
  answerReview: (id: string, outcome: 'right' | 'wrong' | 'skip') => call('POST', '/api/review', { id, outcome }),
  restReview: () => call('POST', '/api/review/rest'),
  reference: () => call<{ status: string; log: string[] }>('GET', '/api/reference'),
  restartReference: () => call<{ status: string; log: string[] }>('POST', '/api/reference/restart'),
  update: () =>
    call<{ current: string | null; latest: string | null; command: string | null }>('GET', '/api/update'),
  launch: (reseed = false) =>
    call<{
      server: LaunchInfo;
      web: { ok: boolean; compileErrors?: CompileError[] } | null;
    }>('POST', '/api/launch', { reseed }),
  launchStatus: () => call<LaunchInfo>('GET', '/api/launch'),
  taskforgeSource: (kind: 'mine' | 'reference') =>
    call<{ entries: ProjectFile[]; passed: number; total: number }>(
      'GET',
      '/api/taskforge/' + kind + '/source',
    ),
  taskforgeFile: (kind: 'mine' | 'reference', path: string) =>
    call<{ path: string; content: string }>(
      'GET',
      '/api/taskforge/' + kind + '/source/file?path=' + encodeURIComponent(path),
    ),
};

export async function referenceGraphQL(
  query: string,
  variables?: unknown,
  token?: string,
  target: 'reference' | 'mine' = 'reference',
) {
  const res = await fetch('/' + target + '/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export interface RelaydeskService {
  status: 'stopped' | 'starting' | 'running' | 'crashed';
  port: number;
  log: string[];
  url: string;
}

export interface LaunchInfo {
  status: string;
  log: string[];
  count: number;
  total: number;
  stage: TaskforgeStage | null;
  step: string | null;
  next: { stage: TaskforgeStage; stepsAway: number } | null;
}

export interface ProjectFile {
  path: string;
  bytes: number;
  step?: string;
  role: 'build' | 'provided' | 'tooling';
  origin: 'saved' | 'starter' | 'provided' | 'reference' | 'generated';
  purpose: string;
}
