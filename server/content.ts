import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import matter from 'gray-matter';
import { CONTENT_DIR } from './paths.js';
import type { Files } from './runner.js';
import type { Language } from '../shared/languages.js';

export type TaskKind = 'drill' | 'forge' | 'bughunt';

export interface LessonItem {
  kind: 'lesson';
  key: string;
  id: string;
  moduleId: string;
  title: string;
  minutes: number;
  body: string;
}

export interface TaskItem {
  kind: TaskKind;
  key: string;
  id: string;
  moduleId: string;
  title: string;
  summary: string;
  env: 'node' | 'dom';
  db: boolean;
  focus: string[];
  readonly: string[];
  /** Entry file (in the task's files) for a browser preview, if any. */
  preview?: string;
  /** Capstone workspace this task writes into. */
  workspace?: string;
  /** Order of this step inside its workspace (0-based). */
  step?: number;
  /** A finished workspace this task runs on. It adds no step and saves nothing back into it. */
  base?: string;
  /** Lessons to go back to when stuck, as item keys. */
  needs: string[];
  instructions: string;
  hints: string[];
  starter: Files;
  solution: Files;
  tests: Files;
}

export type Item = LessonItem | TaskItem;

export interface ModuleInfo {
  id: string;
  number: number;
  title: string;
  part: string;
  stage: number;
  summary: string;
  items: Item[];
}

export interface Curriculum {
  modules: ModuleInfo[];
  byKey: Map<string, Item>;
  /** Forge steps in course order, per workspace. */
  workspaces: Map<string, TaskItem[]>;
}

function readTree(dir: string): Files {
  const out: Files = {};
  if (!existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out[relative(dir, full).replace(/\\/g, '/')] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}

/** Split "## Hints" (with "### ..." sub-sections) out of the task body. */
function splitHints(body: string): { instructions: string; hints: string[] } {
  const idx = body.search(/^## Hints\s*$/m);
  if (idx === -1) return { instructions: body.trim(), hints: [] };
  const instructions = body.slice(0, idx).trim();
  const hintText = body.slice(idx).replace(/^## Hints\s*$/m, '');
  const hints = hintText
    .split(/^### .*$/m)
    .map((h) => h.trim())
    .filter(Boolean);
  return { instructions, hints };
}

/** The same course in another language: only words change, so a task's files and tests stay English. */
export function loadCurriculum(language: Language = 'en'): Curriculum {
  const modules: ModuleInfo[] = [];
  const byKey = new Map<string, Item>();
  const workspaces = new Map<string, TaskItem[]>();
  const translation = (path: string) => {
    const file = join(CONTENT_DIR, '_i18n', language, path);
    return language !== 'en' && existsSync(file) ? readFileSync(file, 'utf8') : null;
  };
  const page = (path: string) => {
    const text = translation(path);
    return text === null ? null : matter(text);
  };

  const dirs = readdirSync(CONTENT_DIR)
    .filter((d) => /^m\d\d-/.test(d) && statSync(join(CONTENT_DIR, d)).isDirectory())
    .sort();

  for (const dir of dirs) {
    const mdir = join(CONTENT_DIR, dir);
    const meta = JSON.parse(readFileSync(join(mdir, 'module.json'), 'utf8')) as {
      title: string;
      part: string;
      stage: number;
      summary: string;
      items: string[];
    };
    const moduleId = dir.slice(0, 3);
    const words = JSON.parse(translation(`${dir}/module.json`) ?? 'null') as { title: string; summary: string } | null;
    const mod: ModuleInfo = {
      id: moduleId,
      number: Number(dir.slice(1, 3)),
      title: words?.title ?? meta.title,
      part: meta.part,
      stage: meta.stage,
      summary: words?.summary ?? meta.summary,
      items: [],
    };

    for (const itemId of meta.items) {
      const key = `${moduleId}/${itemId}`;
      const lessonPath = join(mdir, itemId + '.md');
      const taskDir = join(mdir, itemId);
      let item: Item;
      if (existsSync(lessonPath)) {
        const { data, content } = matter(readFileSync(lessonPath, 'utf8'));
        const own = page(`${dir}/${itemId}.md`);
        item = {
          kind: 'lesson',
          key,
          id: itemId,
          moduleId,
          title: own?.data.title ?? data.title ?? itemId,
          minutes: data.minutes ?? 10,
          body: own?.content ?? content,
        };
      } else if (existsSync(join(taskDir, 'task.md'))) {
        const { data, content } = matter(readFileSync(join(taskDir, 'task.md'), 'utf8'));
        const own = page(`${dir}/${itemId}/task.md`);
        const { instructions, hints } = splitHints(own?.content ?? content);
        item = {
          kind: data.kind ?? 'drill',
          key,
          id: itemId,
          moduleId,
          title: own?.data.title ?? data.title ?? itemId,
          summary: own?.data.summary ?? data.summary ?? '',
          env: data.env ?? 'node',
          db: data.db ?? false,
          focus: data.focus ?? [],
          readonly: data.readonly ?? [],
          preview: data.preview,
          workspace: data.workspace,
          base: data.base,
          needs: data.needs ?? [],
          instructions,
          hints,
          starter: readTree(join(taskDir, 'starter')),
          solution: readTree(join(taskDir, 'solution')),
          tests: readTree(join(taskDir, 'tests')),
        };
        if (item.workspace) {
          const list = workspaces.get(item.workspace) ?? [];
          item.step = list.length;
          list.push(item);
          workspaces.set(item.workspace, list);
        }
      } else {
        throw new Error(`[content] missing item ${key}`);
      }
      mod.items.push(item);
      if (byKey.has(key)) throw new Error(`[content] duplicate item ${key}`);
      byKey.set(key, item);
    }
    modules.push(mod);
  }
  return { modules, byKey, workspaces };
}

const TASK_LOCAL = new Set(['playground.ts', 'playground.tsx']);
export const isTaskLocal = (p: string) => TASK_LOCAL.has(p);

/**
 * Reference state of a workspace *before* step `n`: every earlier step's starter (new files and
 * provided read-only helpers) overlaid with its solution. Task-local files are excluded.
 */
export function cumulative(cur: Curriculum, workspace: string, n: number): Files {
  const steps = cur.workspaces.get(workspace) ?? [];
  const files: Files = {};
  for (const s of steps.slice(0, n)) {
    for (const [p, c] of Object.entries({ ...s.starter, ...s.solution })) {
      if (!isTaskLocal(p)) files[p] = c;
    }
  }
  return files;
}

/** Files a forge step starts from if the learner had no saved work: reference(<n) + new starter files. */
export function stepBase(cur: Curriculum, task: TaskItem): Files {
  return { ...cumulative(cur, task.workspace!, task.step!), ...task.starter };
}

/** Reference solution state *after* a step. */
export function stepSolution(cur: Curriculum, task: TaskItem): Files {
  return { ...stepBase(cur, task), ...task.solution };
}

/** Files any task starts from with no saved work. */
export function taskStart(cur: Curriculum, task: TaskItem): Files {
  if (task.base) {
    const steps = cur.workspaces.get(task.base) ?? [];
    return { ...cumulative(cur, task.base, steps.length), ...task.starter };
  }
  return task.workspace ? stepBase(cur, task) : task.starter;
}

export function taskSolution(cur: Curriculum, task: TaskItem): Files {
  return { ...taskStart(cur, task), ...task.solution };
}
