import type { Curriculum, Item, TaskItem } from '../content.js';
import { getProgress, itemProgress, peekItem, saveProgress, solutionAvailable } from '../progress.js';
import { runJob, type Files, type RunOutput } from '../runner.js';

/** What the mentor needs from the server, passed in so this module never reaches into main.ts. */
export interface MentorDeps {
  curriculum(): Curriculum;
  taskFiles(task: TaskItem): Files;
  readonlyPaths(task: TaskItem): string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const MAX_FILE_LINES = 1500;
const MAX_MESSAGE = 1200;

const NO_ARGS = { type: 'object', properties: {}, required: [], additionalProperties: false };

const BASE_TOOLS: ToolSpec[] = [
  {
    name: 'list_files',
    description:
      "List the files in the learner's workspace for the open exercise, with their size and whether the learner can edit them.",
    parameters: NO_ARGS,
  },
  {
    name: 'read_file',
    description:
      "Read one file from the learner's workspace as it is saved right now (the editor saves within a second of typing). Lines are numbered.",
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path exactly as list_files shows it.' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_tests',
    description:
      "Run the exercise's tests on the learner's saved files. This does not count as an attempt and never marks the exercise passed. Takes a few seconds.",
    parameters: NO_ARGS,
  },
  {
    name: 'read_lesson',
    description: 'Read the full text of a lesson in the course, by its key (for example "m03/l02").',
    parameters: {
      type: 'object',
      properties: { key: { type: 'string', description: 'Lesson key, module/lesson.' } },
      required: ['key'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_progress',
    description:
      'List the items in the current module with where the learner stands on each: lessons done or not, exercises new, started or passed, with submitted attempts.',
    parameters: NO_ARGS,
  },
];

const REFERENCE_TOOL: ToolSpec = {
  name: 'read_reference',
  description:
    "Read the course's reference solution for the open exercise. Pass path null to list the reference files, or a path to read one. Use it only when the learner asks to compare with the reference, or is still stuck after you explained. Reading a file marks the solution as seen in the learner's progress.",
  parameters: {
    type: 'object',
    properties: {
      path: { type: ['string', 'null'], description: 'A reference file path, or null for the list.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
};

const asTask = (item: Item): TaskItem | null => (item.kind === 'lesson' ? null : item);

/** True when the open item's reference answer may be shown. The same rule as the Solution button. */
export const referenceOpen = (item: Item) => item.kind !== 'lesson' && solutionAvailable(peekItem(item.key));

/**
 * The tools for one request, always in the same order so the cached prefix holds. read_reference
 * is left out until the gate opens: before that the model can't call it or learn that it exists.
 */
export function toolSpecs(item: Item): ToolSpec[] {
  return referenceOpen(item) ? [...BASE_TOOLS, REFERENCE_TOOL] : BASE_TOOLS;
}

/** One test run at a time across all threads: each run starts a database and a bundle. */
let testsRunning = false;

export interface ToolOutcome {
  /** What the model sees. */
  output: string;
  /** One quiet line for the learner, like "Read server/resolvers.ts". */
  label: string;
}

function numbered(content: string): string {
  const lines = content.split('\n');
  const shown = lines.slice(0, MAX_FILE_LINES).map((l, i) => `${String(i + 1).padStart(4)}  ${l}`);
  if (lines.length > MAX_FILE_LINES) shown.push(`… ${lines.length - MAX_FILE_LINES} more lines not shown`);
  return shown.join('\n');
}

const cleanPath = (p: unknown) => (typeof p === 'string' ? p.replace(/\\/g, '/').replace(/^\.\//, '') : '');

const clip = (s: string | undefined, n = MAX_MESSAGE) => (!s ? '' : s.length > n ? s.slice(0, n) + ' …' : s);

export function summarizeRun(out: RunOutput): string {
  const lines: string[] = [];
  if (out.compileErrors?.length) {
    lines.push('Compile errors:');
    for (const e of out.compileErrors.slice(0, 5)) lines.push(`- ${e.file}:${e.line}:${e.column} ${e.text}`);
  }
  if (out.crashed) lines.push(`Crashed during ${out.crashed.phase}: ${clip(out.crashed.message)}`);
  if (out.timedOut) lines.push('The run timed out.');
  const passed = out.results.filter((r) => r.passed).length;
  lines.push(`Tests: ${passed}/${out.results.length} passing.`);
  for (const r of out.results) {
    if (r.passed) lines.push(`- PASS ${r.name}`);
    else lines.push(`- FAIL ${r.name}: ${clip(r.message)}${r.hint ? ` (test hint: ${clip(r.hint, 300)})` : ''}`);
  }
  const logs = out.logs.filter((l) => l.level === 'error' || l.level === 'warn').slice(0, 10);
  if (logs.length) {
    lines.push('Console errors and warnings:');
    for (const l of logs) lines.push(`- [${l.level}] ${clip(l.text, 400)}`);
  }
  return lines.join('\n');
}

export async function runTool(
  deps: MentorDeps,
  item: Item,
  name: string,
  rawArgs: string,
  signal: AbortSignal,
): Promise<ToolOutcome> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
    if (typeof args !== 'object' || args === null) throw new Error('not an object');
  } catch {
    return { output: 'Error: the tool arguments were not valid JSON. Try again.', label: `${name} failed` };
  }
  const task = asTask(item);

  switch (name) {
    case 'list_files': {
      if (!task) return { output: 'This item is a lesson; it has no files.', label: 'Listed files' };
      const files = deps.taskFiles(task);
      const ro = new Set(deps.readonlyPaths(task));
      const rows = Object.entries(files).map(
        ([p, c]) => `${p}  (${c.split('\n').length} lines${ro.has(p) ? ', read-only' : ''})`,
      );
      return { output: rows.join('\n') || 'No files.', label: 'Listed the files' };
    }
    case 'read_file': {
      const path = cleanPath(args.path);
      if (!task) return { output: 'This item is a lesson; it has no files.', label: 'Tried to read a file' };
      const files = deps.taskFiles(task);
      if (!(path in files)) {
        return {
          output: `No file "${path}". Files: ${Object.keys(files).join(', ')}`,
          label: `Looked for \`${path}\``,
        };
      }
      return { output: numbered(files[path]), label: `Read \`${path}\`` };
    }
    case 'run_tests': {
      if (!task) return { output: 'This item is a lesson; there are no tests.', label: 'Tried to run tests' };
      if (signal.aborted) return { output: 'Cancelled.', label: 'Test run cancelled' };
      if (testsRunning) {
        return { output: 'Another test run is still going. Try again in a few seconds.', label: 'Tests busy' };
      }
      testsRunning = true;
      let out: RunOutput;
      try {
        out = await runJob({ mode: 'test', files: deps.taskFiles(task), tests: task.tests, env: task.env, db: task.db });
      } finally {
        testsRunning = false;
      }
      const passed = out.results.filter((r) => r.passed).length;
      return {
        output: summarizeRun(out),
        label: out.compileErrors?.length
          ? 'Ran the tests: compile errors'
          : `Ran the tests: ${passed}/${out.results.length} passing`,
      };
    }
    case 'read_lesson': {
      const key = typeof args.key === 'string' ? args.key : '';
      const lesson = deps.curriculum().byKey.get(key);
      if (!lesson || lesson.kind !== 'lesson') return { output: `No lesson "${key}".`, label: `Looked for lesson ${key}` };
      return { output: `# ${lesson.title}\n\n${lesson.body}`, label: `Read the lesson "${lesson.title}"` };
    }
    case 'get_progress': {
      const mod = deps.curriculum().modules.find((m) => m.id === item.moduleId);
      if (!mod) return { output: 'No module found for this item.', label: 'Checked progress' };
      const p = getProgress();
      const rows = mod.items.map((it) => {
        let state: string;
        if (it.kind === 'lesson') state = p.lessons[it.key] ? 'done' : 'not done';
        else {
          const ip = peekItem(it.key);
          state = `${ip?.status ?? 'new'}, ${ip?.attempts ?? 0} attempts`;
        }
        return `- ${it.key} ${it.title} (${it.kind}, ${state})${it.key === item.key ? ' <- open now' : ''}`;
      });
      return { output: [`Module ${mod.number}: ${mod.title}`, ...rows].join('\n'), label: 'Checked progress' };
    }
    case 'read_reference': {
      // The tool isn't offered before the gate opens; this refuses a call made anyway.
      if (!task || !referenceOpen(item)) {
        return { output: 'The reference is not available for this item.', label: 'Reference not available' };
      }
      const ref = task.solution;
      if (args.path === null || args.path === undefined || args.path === '') {
        const rows = Object.entries(ref).map(([p, c]) => `${p}  (${c.split('\n').length} lines)`);
        return { output: rows.join('\n') || 'No reference files.', label: 'Listed the reference files' };
      }
      const path = cleanPath(args.path);
      if (!(path in ref)) {
        return {
          output: `No reference file "${path}". Files: ${Object.keys(ref).join(', ')}`,
          label: 'Looked in the reference',
        };
      }
      const ip = itemProgress(task.key);
      if (!ip.solutionRevealed) {
        ip.solutionRevealed = true;
        saveProgress();
      }
      return { output: numbered(ref[path]), label: `Read the reference \`${path}\`` };
    }
    default:
      return { output: `Unknown tool "${name}".`, label: `Unknown tool ${name}` };
  }
}
