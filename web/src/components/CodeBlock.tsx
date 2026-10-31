import { Highlight, themes } from 'prism-react-renderer';
import { useIsDark } from './useIsDark';

const LANG_ALIAS: Record<string, string> = {
  ts: 'tsx',
  typescript: 'tsx',
  js: 'jsx',
  javascript: 'jsx',
  gql: 'graphql',
  sh: 'bash',
  shell: 'bash',
  text: 'markup',
};

/** Parses `title="x.ts" {2,4-6}` style meta strings. */
export function parseMeta(meta: string | undefined) {
  const title = meta?.match(/title="([^"]+)"/)?.[1];
  const hl = new Set<number>();
  const range = meta?.replace(/title="[^"]*"/, '').match(/\{([\d,\s-]+)\}/)?.[1];
  if (range) {
    for (const part of range.split(',')) {
      const [a, b] = part.trim().split('-').map(Number);
      for (let i = a; i <= (b || a); i++) hl.add(i);
    }
  }
  return { title, hl };
}

export function CodeBlock({
  code,
  lang = 'tsx',
  title,
  highlight,
  showLang = true,
}: {
  code: string;
  lang?: string;
  title?: string;
  highlight?: Set<number>;
  showLang?: boolean;
}) {
  const dark = useIsDark();
  const language = LANG_ALIAS[lang] ?? lang;
  return (
    <div className="codeblock">
      {(title || showLang) && (
        <div className="codeblock-head">
          {title && <span>{title}</span>}
          {showLang && <span className="lang">{lang}</span>}
        </div>
      )}
      <Highlight code={code.replace(/\n$/, '')} language={language} theme={dark ? themes.oneDark : themes.oneLight}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={className} style={style}>
            {tokens.map((line, i) => {
              const props = getLineProps({ line });
              return (
                <span
                  key={i}
                  {...props}
                  className={props.className + ' line' + (highlight?.has(i + 1) ? ' hl' : '')}
                  style={{ display: 'block' }}
                >
                  {line.map((token, k) => (
                    <span key={k} {...getTokenProps({ token })} />
                  ))}
                  {line.length === 1 && line[0].empty ? '\n' : ''}
                </span>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
