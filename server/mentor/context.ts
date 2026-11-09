import type { Item } from '../content.js';
import { getProgress, peekItem } from '../progress.js';
import type { MentorDeps } from './tools.js';

const LANGUAGE_NAMES = { en: 'English', mn: 'Mongolian' } as const;
/** Focus files above this many characters are left for read_file instead of the snapshot. */
const SNAPSHOT_LIMIT = 120_000;

export function languageName(): string {
  return LANGUAGE_NAMES[getProgress().settings.language ?? 'en'] ?? 'English';
}

/** The block that opens a conversation. Fixed for the conversation, so it stays in the cached prefix. */
export function itemContext(deps: MentorDeps, item: Item): string {
  const c = deps.curriculum();
  const mod = c.modules.find((m) => m.id === item.moduleId);
  const head = [
    `# Item context`,
    `Answer in: ${languageName()}`,
    `Module ${mod?.number ?? '?'}: ${mod?.title ?? item.moduleId}`,
    `Item: ${item.title} (${item.kind}, key ${item.key})`,
  ];
  if (item.kind === 'lesson') {
    return [...head, '', '## Lesson text', item.body].join('\n');
  }
  const shownHints = peekItem(item.key)?.hintsShown ?? 0;
  const files = deps.taskFiles(item);
  const ro = new Set(deps.readonlyPaths(item));
  const parts = [
    ...head,
    item.workspace ? `Project: ${item.workspace}, step ${(item.step ?? 0) + 1}` : '',
    '',
    '## Instructions',
    item.instructions,
    '',
    '## Files',
    ...Object.keys(files).map((p) => `- ${p}${ro.has(p) ? ' (read-only)' : ''}${item.focus.includes(p) ? ' (focus)' : ''}`),
    '',
    '## Authored hints (private guidance for you)',
    ...item.hints.map((h, i) => `${i + 1}. ${i < shownHints ? '[shown to the learner] ' : '[not shown] '}${h}`),
  ];
  let budget = SNAPSHOT_LIMIT;
  const snapshot: string[] = [];
  for (const p of item.focus) {
    const content = files[p];
    if (content === undefined || content.length > budget) continue;
    budget -= content.length;
    snapshot.push(`### ${p}\n\`\`\`\n${content}\n\`\`\``);
  }
  if (snapshot.length) {
    parts.push('', '## Focus files when this conversation started (read_file for the current version)', ...snapshot);
  }
  return parts.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/** A short note on progress, sent before a learner message when it differs from the last one. */
export function progressNote(item: Item): string {
  if (item.kind === 'lesson') {
    return `Update: lesson ${getProgress().lessons[item.key] ? 'marked done' : 'not marked done yet'}.`;
  }
  const ip = peekItem(item.key);
  const status = ip?.status ?? 'new';
  const last = ip?.lastResult ? `last submit ${ip.lastResult.passed}/${ip.lastResult.total} tests passing` : 'not submitted yet';
  return `Update: status ${status}, ${ip?.attempts ?? 0} submitted attempts, ${last}, ${ip?.hintsShown ?? 0} of ${item.hints.length} hints shown.`;
}
