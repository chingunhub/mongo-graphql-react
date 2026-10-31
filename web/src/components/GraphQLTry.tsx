import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { referenceGraphQL } from '../api';
import { useIsDark } from './useIsDark';
import { CodeBlock } from './CodeBlock';

/**
 * A live GraphQL playground against the reference Taskforge API.
 * Markdown:  ```graphql-try   (query)  ---variables---  (json)   ---token---  (optional: "demo")
 */
export function GraphQLTry({ source, target = 'reference' }: { source: string; target?: 'reference' | 'mine' }) {
  const [q0, rest = ''] = source.split(/^---variables---\s*$/m);
  const [v0, tok] = rest.split(/^---token---\s*$/m);
  const [query, setQuery] = useState(q0.trim());
  const [vars, setVars] = useState((v0 ?? '').trim());
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dark = useIsDark();
  const useDemoToken = tok?.trim() === 'demo';

  async function run() {
    setBusy(true);
    try {
      let variables: unknown = undefined;
      if (vars.trim()) variables = JSON.parse(vars);
      let token: string | undefined;
      if (useDemoToken) {
        const login = await referenceGraphQL(
          `mutation { login(email: "ada@taskforge.dev", password: "password123") { token } }`,
          undefined,
          undefined,
          target,
        );
        token = login?.data?.login?.token;
      }
      const res = await referenceGraphQL(query, variables, token, target);
      setResult(JSON.stringify(res, null, 2));
    } catch (e) {
      setResult(JSON.stringify({ clientError: (e as Error).message }, null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gqltry">
      <div className="gqltry-head">
        ◆ Try it — {target === 'mine' ? 'your Taskforge API' : 'live Taskforge API'}{useDemoToken ? ' (logged in as Ada)' : ''}
        <button className="btn small primary" onClick={run} disabled={busy}>
          {busy ? <span className="spinner" /> : '▶'} Run
        </button>
      </div>
      <div className="gqltry-body">
        <div>
          <div
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void run();
              }
            }}
          >
            <CodeMirror
              value={query}
              onChange={setQuery}
              extensions={[javascript()]}
              theme={dark ? oneDark : 'light'}
              basicSetup={{ lineNumbers: false, foldGutter: false }}
              minHeight="140px"
            />
          </div>
          {(vars || v0 !== undefined) && (
            <div className="gqltry-vars">
              <div className="gqltry-vars-label">Variables (JSON)</div>
              <CodeMirror
                value={vars}
                onChange={setVars}
                extensions={[javascript()]}
                theme={dark ? oneDark : 'light'}
                basicSetup={{ lineNumbers: false, foldGutter: false }}
                minHeight="40px"
              />
            </div>
          )}
        </div>
        <div className="gqltry-result">
          <div className="pane-label">Response</div>
          {result ? (
            <CodeBlock code={result} lang="json" showLang={false} />
          ) : (
            <div className="empty" style={{ padding: '6px 12px' }}>
              Press Run (or Ctrl+Enter). Edit the query — it's a real server.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
