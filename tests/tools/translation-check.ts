import { createHash } from 'node:crypto';
import matter from 'gray-matter';

const lf = (text: string) => text.replace(/\r\n/g, '\n');

export const sourceHash = (english: string) => createHash('sha256').update(lf(english)).digest('hex');

const FENCE = /^[ \t]*(`{3,})(\S*)[ \t]*(.*)\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm;

function fences(body: string) {
  return [...body.matchAll(FENCE)].map(([, , lang, meta, text]) => ({ lang, meta: meta.trim(), text }));
}

const sorted = (values: string[]) => [...values].sort();
const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

const inlineCode = (text: string) => sorted([...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]));

function prose(body: string) {
  const text = body.replace(FENCE, '');
  return {
    headings: [...text.matchAll(/^(#{1,6}) /gm)].map((match) => match[1]),
    hints: /^## Hints\s*$/m.test(text),
    callouts: [...text.matchAll(/^> \[!(\w+)\]/gm)].map((match) => match[1]),
    code: inlineCode(text),
    links: sorted([...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1])),
  };
}

/** The one rule for a quiz: the same options, right in the same places, with the same code in them. */
function compareQuestion(english: string, translated: string, where: string) {
  const parse = (source: string) => {
    const lines = source.trim().split('\n');
    return {
      lesson: lines.find((line) => line.startsWith('L:'))?.slice(2).trim() ?? '',
      question: lines.filter((line) => line.startsWith('Q:')).join(' '),
      options: lines.filter((line) => /^- \[[ x]\]/.test(line)),
      explain: lines.filter((line) => line.startsWith('>')).join(' '),
    };
  };
  const a = parse(english);
  const b = parse(translated);
  const problems: string[] = [];
  if (a.lesson !== b.lesson) problems.push(`${where}: the lesson link changed`);
  if (!same(a.options.map((o) => o.slice(0, 5)), b.options.map((o) => o.slice(0, 5)))) {
    problems.push(`${where}: the options or the right answer changed`);
  } else if (a.options.some((option, i) => !same(inlineCode(option), inlineCode(b.options[i])))) {
    problems.push(`${where}: code in an option changed`);
  }
  if (!same(inlineCode(a.question), inlineCode(b.question))) problems.push(`${where}: code in the question changed`);
  if (!same(inlineCode(a.explain), inlineCode(b.explain))) problems.push(`${where}: code in the explanation changed`);
  return problems;
}

/** Strings under these keys are data or wiring. All the others are words and can change. */
const FIXED = new Set(['id', 'from', 'to', 'color', 'code', 'docs']);

function compareSpec(a: unknown, b: unknown, where: string, fixed = false): string[] {
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return [`${where}: the length changed`];
    return a.flatMap((value, i) => compareSpec(value, b[i], `${where}[${i}]`, fixed));
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') return [`${where}: the shape changed`];
    if (!same(Object.keys(a).sort(), Object.keys(b).sort())) return [`${where}: the keys changed`];
    return Object.entries(a).flatMap(([key, value]) =>
      compareSpec(value, (b as Record<string, unknown>)[key], `${where}.${key}`, fixed || FIXED.has(key)),
    );
  }
  if (typeof a === 'string' && typeof b === 'string' && !fixed) return [];
  return a === b ? [] : [`${where}: the value changed`];
}

// eslint-disable-next-line no-new-func
const parseSpec = (text: string): unknown => (text.trim() ? new Function(`return (${text});`)() : {});

function compareFence(a: { lang: string; meta: string; text: string }, b: typeof a, where: string) {
  if (a.lang !== b.lang) return [`${where}: ${a.lang || 'plain'} became ${b.lang || 'plain'}`];
  if (a.lang === 'quiz') return compareQuestion(a.text, b.text, where);
  if (a.lang === 'checkpoint') {
    const left = a.text.split(/^---$/m);
    const right = b.text.split(/^---$/m);
    if (left.length !== right.length) return [`${where}: the number of questions changed`];
    return left.flatMap((question, i) => compareQuestion(question, right[i], `${where} question ${i + 1}`));
  }
  if (a.lang === 'viz' || a.lang.startsWith('viz-')) {
    if (a.lang === 'viz' && a.meta.split(/\s+/)[0] !== b.meta.split(/\s+/)[0]) return [`${where}: a different diagram`];
    try {
      return compareSpec(parseSpec(a.text), parseSpec(b.text), where);
    } catch (e) {
      return [`${where}: ${(e as Error).message}`];
    }
  }
  // A code block may translate its caption and nothing else.
  const meta = (value: string) => value.replace(/title="[^"]*"/, '').trim();
  if (meta(a.meta) !== meta(b.meta)) return [`${where}: the block's settings changed`];
  return a.text === b.text ? [] : [`${where}: the code changed`];
}

/** What's wrong with a translated page, as sentences. An empty list means it's fine. */
export function checkPage(english: string, translated: string) {
  const source = matter(lf(english));
  const page = matter(lf(translated));
  const problems: string[] = [];
  if (page.data.source !== sourceHash(english)) problems.push('outdated: the English page changed after this translation');
  if (!page.data.title) problems.push('no title');
  if (source.data.summary && !page.data.summary) problems.push('no summary');

  const a = prose(source.content);
  const b = prose(page.content);
  if (!same(a.headings, b.headings)) problems.push('the headings changed');
  if (a.hints !== b.hints) problems.push('"## Hints" must stay as it is');
  if (!same(a.callouts, b.callouts)) problems.push('the callouts changed');
  if (!same(a.links, b.links)) problems.push('the links changed');
  if (!same(a.code, b.code)) {
    const lost = a.code.filter((code) => !b.code.includes(code));
    const added = b.code.filter((code) => !a.code.includes(code));
    problems.push(`inline code changed (lost: ${lost.join(', ') || 'none'}; added: ${added.join(', ') || 'none'})`);
  }

  const left = fences(source.content);
  const right = fences(page.content);
  if (left.length !== right.length) return [...problems, `${left.length} blocks became ${right.length}`];
  return [...problems, ...left.flatMap((fence, i) => compareFence(fence, right[i], `block ${i + 1} (${fence.lang || 'plain'})`))];
}

/** A translated module.json holds only the words, plus the hash of the English one. */
export function checkModule(english: string, translated: string) {
  const page = JSON.parse(translated) as { title?: string; summary?: string; source?: string };
  const problems: string[] = [];
  if (page.source !== sourceHash(english)) problems.push('outdated: the English module.json changed');
  if (!page.title) problems.push('no title');
  if (!page.summary) problems.push('no summary');
  return problems;
}
