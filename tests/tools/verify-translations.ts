import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadCurriculum } from '../../server/content.js';
import { CONTENT_DIR } from '../../server/paths.js';
import { checkModule, checkPage, sourceHash } from './translation-check.js';

// `--stamp` fills in `source: pending` on a page that has just been written.
const stamp = process.argv.includes('--stamp');
// `--only=m02` leaves other modules alone, so translators can run side by side.
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
const I18N = join(CONTENT_DIR, '_i18n');

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? pages(full) : [full];
  });
}

let failed = 0;
for (const language of existsSync(I18N) ? readdirSync(I18N) : []) {
  const root = join(I18N, language);
  const done = new Set<string>();
  for (const file of pages(root)) {
    const path = relative(root, file).replace(/\\/g, '/');
    const source = join(CONTENT_DIR, path);
    done.add(path);
    if (only && !path.startsWith(only)) continue;
    if (!existsSync(source)) {
      failed++;
      console.log(`✗ ${language}/${path}: there is no English page with this path`);
      continue;
    }
    const english = readFileSync(source, 'utf8');
    if (stamp) {
      const text = readFileSync(file, 'utf8');
      const filled = text.replace(/^source: pending$/m, `source: ${sourceHash(english)}`).replace('"source": "pending"', `"source": "${sourceHash(english)}"`);
      if (filled !== text) writeFileSync(file, filled);
    }
    const translated = readFileSync(file, 'utf8');
    const problems = path.endsWith('module.json') ? checkModule(english, translated) : checkPage(english, translated);
    failed += problems.length;
    console.log(problems.length ? `✗ ${language}/${path}` : `✓ ${language}/${path}`);
    for (const problem of problems) console.log(`    ${problem}`);
  }

  const cur = loadCurriculum();
  for (const stage of [1, 2, 3]) {
    const items = cur.modules.filter((m) => m.stage === stage).flatMap((m) => m.items);
    const dirs = readdirSync(CONTENT_DIR);
    const translated = items.filter((item) => {
      const dir = dirs.find((name) => name.startsWith(item.moduleId + '-'))!;
      return done.has(`${dir}/${item.id}.md`) || done.has(`${dir}/${item.id}/task.md`);
    });
    console.log(`${language} stage ${stage}: ${translated.length} of ${items.length} items`);
  }
}

if (failed) {
  console.log(`\n${failed} problem${failed === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\nAll translations match their English pages.');
