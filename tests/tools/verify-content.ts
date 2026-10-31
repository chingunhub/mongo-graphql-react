// For every task: the reference solution must pass every test, and the starter must fail at least one.
// Usage: npm run verify [-- <filter>]
import { loadCurriculum, taskSolution, taskStart, cumulative, isTaskLocal, type TaskItem } from '../../server/content.js';
import { runJob, type RunOutput } from '../../server/runner.js';

const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
const from = Number(process.argv.find((arg) => arg.startsWith('--from='))?.slice(7) ?? 0);
const cur = loadCurriculum();
const tasks = [...cur.byKey.values()].filter(
  (i): i is TaskItem =>
    i.kind !== 'lesson' && Number(i.moduleId.slice(1)) >= from && (!filter || i.key.includes(filter)),
);

function summarize(out: RunOutput) {
  if (out.compileErrors) return 'compile: ' + out.compileErrors.map((e) => `${e.file}:${e.line} ${e.text}`).join('; ');
  if (out.crashed) return `crashed(${out.crashed.phase}): ${out.crashed.message}`;
  const failed = out.results.filter((r) => !r.passed);
  return (
    `${out.results.length - failed.length}/${out.results.length}` +
    (failed.length ? ' — ' + failed.map((f) => `"${f.name}": ${f.message?.split('\n')[0]}`).join(' | ') : '')
  );
}

let bad = 0;

// Structural rule: a forge step's starter may only add NEW files (or provided read-only ones),
// because learners' own versions of existing files are never overwritten by starters.
for (const t of tasks.filter((x) => x.workspace)) {
  const before = cumulative(cur, t.workspace!, t.step!);
  const steps = cur.workspaces.get(t.workspace!)!;
  const readonly = new Set(steps.slice(0, t.step! + 1).flatMap((s) => s.readonly));
  for (const p of Object.keys(t.starter)) {
    if (p in before && !readonly.has(p) && !isTaskLocal(p)) {
      bad++;
      console.log(`BAD ${t.key}: starter overrides existing learner file ${p}`);
    }
  }
}

for (const t of tasks) {
  const sol = taskSolution(cur, t);
  const start = taskStart(cur, t);
  const [a, b] = await Promise.all([
    runJob({ mode: 'test', files: sol, tests: t.tests, env: t.env, db: t.db }),
    runJob({ mode: 'test', files: start, tests: t.tests, env: t.env, db: t.db }),
  ]);
  const solOk = a.ok;
  const starterFails = !b.ok && (Number(t.moduleId.slice(1)) < 14 || b.results.some((result) => !result.passed));
  const status = solOk && starterFails ? 'ok ' : 'BAD';
  if (status === 'BAD') bad++;
  console.log(`${status} ${t.key.padEnd(34)} solution ${summarize(a)}`);
  if (!solOk && a.logs.length)
    console.log(
      '    logs:',
      a.logs
        .slice(0, 8)
        .map((l) => l.text)
        .join('\n          '),
    );
  if (!starterFails) console.log(`    starter unexpectedly passes: ${summarize(b)}`);
  if (process.argv.includes('--starter')) console.log(`    starter: ${summarize(b)}`);
}
console.log(`\n${tasks.length - bad}/${tasks.length} tasks verified`);
process.exit(bad ? 1 : 0);
