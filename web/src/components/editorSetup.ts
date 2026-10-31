import { javascript } from '@codemirror/lang-javascript';
import { delimitedIndent, indentNodeProp, indentUnit, LanguageSupport, type LRLanguage } from '@codemirror/language';
import { acceptCompletion, completionStatus } from '@codemirror/autocomplete';
import { indentLess, indentMore } from '@codemirror/commands';
import { EditorSelection, Prec, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';

const INDENT = '  ';

/**
 * TS/JS with Prettier-style continuation indents. CodeMirror's default lines a new line up with
 * whatever follows an open bracket, so Enter after `new Schema({ ... },` jumped ~30 columns to
 * sit under the `{`. Prettier (and every real codebase) just indents one level instead.
 */
let tsSupport: LanguageSupport | null = null;
function typescriptSupport() {
  if (tsSupport) return tsSupport;
  const base = javascript({ typescript: true, jsx: true });
  const lang = (base.language as LRLanguage).configure({
    props: [
      indentNodeProp.add({
        'ArgList ParamList': delimitedIndent({ closing: ')', align: false }),
        ArrayExpression: delimitedIndent({ closing: ']', align: false }),
        'ObjectExpression ObjectPattern ObjectType': delimitedIndent({ closing: '}', align: false }),
        'TypeArgList TypeParamList': delimitedIndent({ closing: '>', align: false }),
      }),
    ],
  });
  return (tsSupport = new LanguageSupport(lang, base.support));
}

/** Tab with nothing selected: spaces up to the next 2-column stop, at the cursor (like VS Code). */
function insertSoftTab(view: EditorView) {
  const { state } = view;
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore(view);
  view.dispatch(
    state.changeByRange((range) => {
      const line = state.doc.lineAt(range.head);
      const col = range.head - line.from;
      const spaces = ' '.repeat(INDENT.length - (col % INDENT.length));
      return { changes: { from: range.head, insert: spaces }, range: EditorSelection.cursor(range.head + spaces.length) };
    }),
    { scrollIntoView: true, userEvent: 'input' },
  );
  return true;
}

const tabKeys = Prec.highest(
  keymap.of([
    {
      key: 'Tab',
      // An open suggestion list wins; otherwise indent (selection) or insert spaces (cursor).
      run: (view) => (completionStatus(view.state) === 'active' ? acceptCompletion(view) : insertSoftTab(view)),
      shift: indentLess,
    },
  ]),
);

export function editorExtensions(path: string, onFormat?: () => void): Extension[] {
  const exts: Extension[] = [indentUnit.of(INDENT), tabKeys];
  if (/\.(tsx?|jsx?|mjs)$/.test(path)) exts.push(typescriptSupport());
  if (onFormat)
    exts.push(
      Prec.highest(
        keymap.of([
          {
            key: 'Shift-Alt-f',
            preventDefault: true,
            run: () => {
              onFormat();
              return true;
            },
          },
        ]),
      ),
    );
  return exts;
}

// ---------------------------------------------------------------------------------------------
// Prettier (loaded on first use: the parsers are a few MB and most page views never need them).

const PARSERS: [RegExp, string][] = [
  [/\.(tsx?|mts|cts)$/, 'typescript'],
  [/\.(jsx?|mjs|cjs)$/, 'babel'],
  [/\.json$/, 'json'],
  [/\.(graphql|gql)$/, 'graphql'],
];

export function canFormat(path: string) {
  return PARSERS.some(([re]) => re.test(path));
}

let prettierLoad: Promise<{ format: typeof import('prettier/standalone').formatWithCursor; plugins: any[] }> | null =
  null;
function loadPrettier() {
  prettierLoad ??= Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/typescript'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/graphql'),
  ]).then(([p, ...plugins]) => ({ format: p.formatWithCursor, plugins }));
  return prettierLoad;
}

export type FormatResult = { ok: true; changed: boolean } | { ok: false; error: string };

/**
 * Prettier-format the editor's document in place, keeping the cursor where it was in the code.
 * Only the changed middle of the document is replaced, so scroll position and undo stay sane.
 */
export async function formatView(view: EditorView, path: string): Promise<FormatResult> {
  const parser = PARSERS.find(([re]) => re.test(path))?.[1];
  if (!parser) return { ok: false, error: 'No formatter for this file type' };
  const { format, plugins } = await loadPrettier();
  const before = view.state.doc.toString();
  let out: { formatted: string; cursorOffset: number };
  try {
    out = await format(before, {
      parser,
      plugins,
      cursorOffset: view.state.selection.main.head,
      singleQuote: true,
      printWidth: 120,
      trailingComma: 'all',
    });
  } catch (e) {
    // Syntax errors: say where, but leave the code alone.
    return { ok: false, error: String((e as Error).message).split('\n')[0] };
  }
  // The document may have changed while Prettier was loading/running; don't clobber new typing.
  if (view.state.doc.toString() !== before) return { ok: true, changed: false };
  const after = out.formatted;
  if (after === before) return { ok: true, changed: false };
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  view.dispatch({
    changes: { from: start, to: endB, insert: after.slice(start, endA) },
    selection: { anchor: Math.max(0, Math.min(out.cursorOffset, after.length)) },
    userEvent: 'input.format',
  });
  return { ok: true, changed: true };
}
