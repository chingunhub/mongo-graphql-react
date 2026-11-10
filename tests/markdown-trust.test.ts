import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import globalJsdom from 'global-jsdom';

const clean = globalJsdom(undefined, { url: 'http://localhost/' });
document.documentElement.setAttribute('data-theme', 'light');
const { Markdown } = await import('../web/src/components/Markdown');
const { CurriculumContext } = await import('../web/src/App');
const render = (text: string, authored = false) =>
  renderToStaticMarkup(
    createElement(
      CurriculumContext.Provider,
      { value: { data: null, find: () => null } as any },
      createElement(Markdown, { text, authored }),
    ),
  );
const fence = String.fromCharCode(96).repeat(3);
test.after(clean);

for (const lang of ['viz-sequence', 'viz-flow', 'viz-tree', 'viz-pipeline', 'viz objectid']) {
  test('model fence stays inert: ' + lang, () => {
    (globalThis as any).__mentorProbe = 0;
    const html = render(fence + lang + '\n(globalThis.__mentorProbe = 1, {})\n' + fence);
    assert.equal((globalThis as any).__mentorProbe, 0);
    assert.match(html, /__mentorProbe/);
    assert.match(html, /codeblock/);
  });
}
test('alternate fences, partial streams, and voice snippet breakouts stay inert', () => {
  for (const text of [
    '~~~viz-flow\n({ [globalThis.__mentorProbe = 2]: true })\n~~~',
    fence + 'viz-flow\n(() => { globalThis.__mentorProbe = 3; return {}; })()',
    'Caption\n\n' +
      fence +
      'ts\n// example\n' +
      fence +
      '\n' +
      fence +
      'viz-flow\n(globalThis.__mentorProbe = 4, {})\n' +
      fence,
  ]) {
    (globalThis as any).__mentorProbe = 0;
    render(text);
    assert.equal((globalThis as any).__mentorProbe, 0);
  }
});
test('untrusted course controls stay ordinary code, including network playgrounds', () => {
  for (const lang of ['graphql-try', 'quiz', 'checkpoint', 'compare']) {
    const html = render(fence + lang + '\nQ: Choose\n- [x] Yes\n- [ ] No\n' + fence);
    assert.match(html, /codeblock/);
    assert.doesNotMatch(html, /<button|<textarea/);
  }
});
test('authored relaxed diagrams and ordinary mentor formatting remain available', () => {
  const html = render(
    fence + "viz-flow\n{title:'Authored flow', nodes:[{id:'a',label:'Start',col:0,row:0,},],edges:[],}\n" + fence,
    true,
  );
  assert.match(html, /<svg/);
  assert.match(html, /Authored flow/);
  assert.match(html, /Start/);
  const ordinary = render(
    '**Reason first**\n\n[Docs](https://example.com)\n\n> [!TIP] Predict the result\n\n' +
      fence +
      'ts title="demo.ts"\nconst n = 1;\n' +
      fence,
  );
  assert.match(ordinary, /<strong>Reason first/);
  assert.match(ordinary, /href="https:\/\/example.com"/);
  assert.match(ordinary, /callout tip/);
  assert.match(ordinary, /demo.ts/);
});
test('authored checkpoints, quizzes, comparisons and GraphQL controls still render', () => {
  for (const lang of ['quiz', 'checkpoint']) {
    const html = render(fence + lang + '\nQ: Choose\n- [x] Yes\n- [ ] No\n' + fence, true);
    assert.doesNotMatch(html, /class="codeblock"/);
    assert.match(html, /Choose/);
  }
  assert.match(
    render(fence + 'compare\n--- Query (graphql)\n{ me }\n--- Result (json)\n{}\n' + fence, true),
    /class="compare"/,
  );
  assert.match(render(fence + 'graphql-try\nquery { __typename }\n' + fence, true), /<textarea|<button/);
});
