import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Children, isValidElement, type ReactNode } from 'react';
import { CodeBlock, parseMeta } from './CodeBlock';
import { GraphQLTry } from './GraphQLTry';
import { Checkpoint, Quiz } from './Quiz';
import { Sequence } from '../viz/Sequence';
import { Flow } from '../viz/Flow';
import { Tree } from '../viz/Tree';
import { Pipeline } from '../viz/Pipeline';
import { BESPOKE } from '../viz/bespoke';
import { onLinkClick } from '../router';
import { t, type StringKey } from '../i18n';

/** Relaxed object-literal parsing for viz specs (trailing commas, unquoted keys). Content is local & trusted. */
function parseSpec(text: string): unknown {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${text});`)();
}

function VizError({ msg }: { msg: string }) {
  return <div className="callout caution">Diagram error: {msg}</div>;
}

/**
 * ```compare
 * --- Query (graphql)
 * ...
 * --- Response (json)
 * ...
 * ```
 */
function Compare({ source }: { source: string }) {
  const parts = source.split(/^--- /m).filter((p) => p.trim());
  return (
    <div className="compare">
      {parts.map((p, i) => {
        const [head, ...body] = p.split('\n');
        const m = head.match(/^(.*?)\s*(?:\((\w[\w-]*)\))?\s*$/);
        return <CodeBlock key={i} code={body.join('\n')} title={m?.[1]} lang={m?.[2] ?? 'ts'} />;
      })}
    </div>
  );
}

function renderFence(lang: string, meta: string | undefined, text: string): ReactNode {
  try {
    switch (lang) {
      case 'graphql-try':
        return <GraphQLTry source={text} />;
      case 'checkpoint':
        return <Checkpoint source={text} />;
      case 'quiz':
        return <Quiz source={text} />;
      case 'compare':
        return <Compare source={text} />;
      case 'viz-sequence':
        return <Sequence spec={parseSpec(text) as never} />;
      case 'viz-flow':
        return <Flow spec={parseSpec(text) as never} />;
      case 'viz-tree':
        return <Tree spec={parseSpec(text) as never} />;
      case 'viz-pipeline':
        return <Pipeline spec={parseSpec(text) as never} />;
      case 'viz': {
        const name = (meta ?? '').trim().split(/\s+/)[0];
        const C = BESPOKE[name];
        if (!C) return <VizError msg={`unknown viz "${name}"`} />;
        return <C spec={text.trim() ? parseSpec(text) : {}} />;
      }
    }
  } catch (e) {
    return <VizError msg={(e as Error).message} />;
  }
  const { title, hl } = parseMeta(meta);
  return <CodeBlock code={text} lang={lang || 'text'} title={title} highlight={hl} />;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

const components: Components = {
  pre({ node }) {
    const code = node?.children?.[0] as
      | { type: string; tagName?: string; properties?: { className?: string[] }; data?: { meta?: string }; children?: { value?: string }[] }
      | undefined;
    if (!code || code.tagName !== 'code') return <pre>{textOf(node as never)}</pre>;
    const lang = (code.properties?.className?.[0] ?? '').replace('language-', '');
    const text = (code.children ?? []).map((c) => c.value ?? '').join('');
    return <>{renderFence(lang, code.data?.meta, text)}</>;
  },
  blockquote({ children }) {
    const arr = Children.toArray(children).filter((c) => !(typeof c === 'string' && !c.trim()));
    const first = textOf(arr[0]);
    const m = first.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|BRIDGE)\](?:\s*(.*))?/);
    if (m) {
      const kind = m[1];
      // Remove the marker from the first paragraph.
      const firstEl = arr[0];
      let rest: ReactNode[] = arr.slice(1);
      let title: ReactNode = t(`callout.${kind}` as StringKey);
      if (isValidElement(firstEl)) {
        const kids = Children.toArray((firstEl.props as { children?: ReactNode }).children);
        const head = typeof kids[0] === 'string' ? (kids[0] as string).replace(/^\s*\[!\w+\][ \t]*/, '') : '';
        // A custom title runs to the end of the marker's line, and it can hold inline code.
        const nodes: ReactNode[] = [head, ...kids.slice(1)];
        const end = nodes.findIndex((k) => typeof k === 'string' && k.includes('\n'));
        const custom = nodes.slice(0, end === -1 ? nodes.length : end);
        const remainder = end === -1 ? [] : nodes.slice(end + 1);
        if (end !== -1) {
          const [line, ...after] = (nodes[end] as string).split('\n');
          custom.push(line.trimEnd());
          remainder.unshift(after.join('\n'));
        }
        const blank = (k: ReactNode) => typeof k === 'string' && !k.trim();
        if (!custom.every(blank)) title = custom;
        if (!remainder.every(blank)) rest = [<p key="first">{remainder}</p>, ...rest];
      }
      return (
        <div className={'callout ' + kind.toLowerCase()}>
          <div className="callout-title">{title}</div>
          {rest}
        </div>
      );
    }
    return <blockquote>{children}</blockquote>;
  },
  a({ href, children }) {
    const internal = href?.startsWith('/');
    return (
      <a href={href} onClick={internal ? onLinkClick : undefined} target={internal ? undefined : '_blank'} rel="noreferrer">
        {children}
      </a>
    );
  },
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
