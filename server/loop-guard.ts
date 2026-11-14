// A guard against endless loops in the preview.
//
// A preview runs the learner's code in the same browser tab as the editor. A loop that never ends
// (`while (i < items.length) {}`) would freeze that tab, editor included. So before bundling, every
// loop in the learner's files gets a check added to its body. A loop that is still going after
// LOOP_LIMIT_MS is stopped by an error, and the preview page shows a message (see previewHtml in
// services.ts).
//
// Task files are TypeScript and JSX, which acorn can't read, so each file is first turned into plain
// JavaScript by esbuild. The source map from that step gives back the line the learner wrote.
// Nothing is added on a new line, so the map stays right line for line.
import { parse, type Node } from 'acorn';
import * as esbuild from 'esbuild';

const LOOPS = new Set(['WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement']);

type Insert = { at: number; text: string; open: boolean; depth: number };
type AnyNode = Node & Record<string, unknown>;
type LineOf = (line: number, column: number) => number;

/**
 * Does this code hand control back part-way through, with `await` or `yield`? A loop like
 * `while (true) { await nextFrame(); }` is meant to run for ever and freezes nothing, so it is left alone.
 * Functions inside are not looked into: their awaits are their own.
 */
function pauses(node: AnyNode): boolean {
  if (node.type === 'AwaitExpression' || node.type === 'YieldExpression') return true;
  if (node.type === 'ForOfStatement' && node.await) return true;
  if (/Function/.test(node.type)) return false;
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    const value = node[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object' && typeof (child as AnyNode).type === 'string' && pauses(child as AnyNode)) return true;
    }
  }
  return false;
}

/**
 * Plain JavaScript with a guard in every loop. `lineOf` turns a place in `source` into the line to
 * name in the message. Code that does not parse is returned as it is.
 */
export function guardLoops(source: string, file: string, lineOf: LineOf = (line) => line): string {
  let tree: Node;
  try {
    tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch {
    return source;
  }
  const inserts: Insert[] = [];
  let count = 0;

  const visit = (node: AnyNode, depth: number, labelled: AnyNode | null) => {
    if (LOOPS.has(node.type) && !node.await && !pauses(node.body as AnyNode)) {
      const name = `__forgeLoop${count++}`;
      // The whole statement, with any labels in front of it, goes inside a block of its own.
      const outer = labelled ?? node;
      const line = lineOf(node.loc!.start.line, node.loc!.start.column);
      inserts.push({ at: outer.start, text: `{ const ${name} = __forgeLoopStart(); `, open: true, depth });
      inserts.push({ at: outer.end, text: ' }', open: false, depth });
      const body = node.body as AnyNode;
      const check = `__forgeLoopCheck(${name}, ${JSON.stringify(file)}, ${line});`;
      if (body.type === 'BlockStatement') {
        inserts.push({ at: body.start + 1, text: ` ${check}`, open: true, depth: depth + 0.5 });
      } else {
        inserts.push({ at: body.start, text: `{ ${check} `, open: true, depth: depth + 0.5 });
        inserts.push({ at: body.end, text: ' }', open: false, depth: depth + 0.5 });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue;
      const value = node[key];
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child && typeof child === 'object' && typeof (child as AnyNode).type === 'string') {
          // A label belongs to the statement after it: `outer: for (…)` must stay together.
          const carry = node.type === 'LabeledStatement' ? (labelled ?? node) : null;
          visit(child as AnyNode, depth + 1, carry);
        }
      }
    }
  };
  visit(tree as AnyNode, 0, null);
  if (!inserts.length) return source;

  // Where two insertions meet at one place, outer openings come first and outer closings come last.
  inserts.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    if (a.open !== b.open) return a.open ? 1 : -1; // closings of what came before, then openings
    return a.open ? a.depth - b.depth : b.depth - a.depth;
  });
  let out = '';
  let last = 0;
  for (const insert of inserts) {
    out += source.slice(last, insert.at) + insert.text;
    last = insert.at;
  }
  return out + source.slice(last);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** A source map's `mappings`, read into a lookup from a place in the output to a line of the original (both 1-based). */
function lineLookup(mappings: string): LineOf {
  const lines: { column: number; line: number }[][] = [];
  let sourceLine = 0;
  for (const row of mappings.split(';')) {
    const segments: { column: number; line: number }[] = [];
    let column = 0;
    for (const segment of row.split(',')) {
      if (!segment) continue;
      const fields: number[] = [];
      let value = 0;
      let shift = 0;
      for (const char of segment) {
        const digit = B64.indexOf(char);
        value += (digit & 31) << shift;
        if (digit & 32) shift += 5;
        else {
          fields.push(value & 1 ? -(value >> 1) : value >> 1);
          value = shift = 0;
        }
      }
      column += fields[0];
      if (fields.length >= 4) {
        sourceLine += fields[2];
        segments.push({ column, line: sourceLine + 1 });
      }
    }
    lines.push(segments);
  }
  return (line, column) => {
    for (let at = line - 1; at >= 0; at--) {
      const segments = lines[at] ?? [];
      const found = at === line - 1 ? segments.filter((s) => s.column <= column).pop() ?? segments[0] : segments[segments.length - 1];
      if (found) return found.line;
    }
    return line;
  };
}

const LOADERS: Record<string, esbuild.Loader> = { ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js' };

/**
 * One of the learner's files, as guarded JavaScript for the bundler, with a source map back to what
 * they wrote. Null means "leave this file to the bundler": it has no loops, or it does not compile
 * and the bundler's own error is the one to show.
 */
export async function guardFile(source: string, path: string, file: string): Promise<string | null> {
  if (!/\b(while|for|do)\b/.test(source)) return null;
  const loader = LOADERS[path.slice(path.lastIndexOf('.') + 1)];
  if (!loader) return null;
  try {
    const plain = await esbuild.transform(source, {
      loader,
      jsx: 'automatic',
      format: 'esm',
      target: 'esnext',
      sourcemap: 'external',
      sourcefile: path.split(/[\\/]/).pop(),
      logLevel: 'silent',
    });
    const guarded = guardLoops(plain.code, file, lineLookup(JSON.parse(plain.map).mappings));
    if (guarded === plain.code) return null;
    return `${guarded}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(plain.map, 'utf8').toString('base64')}\n`;
  } catch {
    return null;
  }
}

/** How long one loop may run before the preview stops it. */
export const LOOP_LIMIT_MS = 1000;

/** The two functions the guarded code calls. They go in the preview page, before the bundle. */
export const LOOP_GUARD_RUNTIME = `
  let __forgeStopped = null;
  let __forgeTurns = 0;
  window.__forgeLoopStart = () => performance.now();
  window.__forgeLoopCheck = (start, file, line) => {
    // Once one loop has been stopped, every loop stops at once: code that runs again (a re-render,
    // a timer) would otherwise hold the page for another second each time.
    if (__forgeStopped) throw new Error(__forgeStopped);
    if ((++__forgeTurns & 255) !== 0) return;
    if (performance.now() - start < ${LOOP_LIMIT_MS}) return;
    __forgeStopped = 'The loop at line ' + line + ' of ' + file + ' ran for a whole second without finishing, so the preview stopped it. ' +
      'Does anything inside the loop change what its condition checks? Fix it and press Run to start the preview again.';
    throw new Error(__forgeStopped);
  };
`;
