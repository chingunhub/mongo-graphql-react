import type { Curriculum, Item, TaskItem } from '../content.js';
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

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'list_files',
    description:
      "List the files in the learner's workspace for the open exercise, with their size and whether the learner can edit them.",
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
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
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
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
];

export interface ToolOutcome {
  /** What the model sees. */
  output: string;
  /** One quiet line for the learner, like "Read server/resolvers.ts". */
  label: string;
}

const asTask = (item: Item): TaskItem | null => (item.kind === 'lesson' ? null : item);

function numbered(content: string): string {
  const lines = content.split('\n');
  const shown = lines.slice(0, MAX_FILE_LINES).map((l, i) => `${String(i + 1).padStart(4)}  ${l}`);
  if (lines.length > MAX_FILE_LINES) shown.push(`… ${lines.length - MAX_FILE_LINES} more lines not shown`);
  return shown.join('\n');
}

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
      const path = typeof args.path === 'string' ? args.path.replace(/\\/g, '/').replace(/^\.\//, '') : '';
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
      const out = await runJob({
        mode: 'test',
        files: deps.taskFiles(task),
        tests: task.tests,
        env: task.env,
        db: task.db,
      });
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
    default:
      return { output: `Unknown tool "${name}".`, label: `Unknown tool ${name}` };
  }
}
