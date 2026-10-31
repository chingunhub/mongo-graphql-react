// Provided: the app shell — login, project tabs, and YOUR components (CreateIssueForm, Board).
import { useMemo, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { createApolloClient } from './apollo';
import { Board } from './components/Board';
import { CreateIssueForm } from './components/CreateIssueForm';
import { LoginForm } from './LoginForm';

const APP_SHELL = gql`
  query AppShell {
    me {
      id
      name
    }
    projects {
      id
      key
      name
    }
  }
`;

function Shell({ onLogout }: { onLogout: () => void }) {
  const { data, loading, error } = useQuery<any>(APP_SHELL);
  const [selected, setSelected] = useState<string | null>(null);

  if (loading && !data) return <p className="tf-pad">Loading…</p>;
  if (error) return <p role="alert" className="tf-pad">{error.message}</p>;

  const projects: { id: string; key: string; name: string }[] = data.projects;
  const project = projects.find((p) => p.key === selected) ?? projects[0];

  return (
    <div className="tf-app">
      <header className="tf-header">
        <strong>⚒ Taskforge</strong>
        <nav className="tf-tabs">
          {projects.map((p) => (
            <button key={p.id} className={p.key === project?.key ? 'active' : ''} onClick={() => setSelected(p.key)}>
              {p.key} · {p.name}
            </button>
          ))}
        </nav>
        <span className="tf-me">
          {data.me?.name} <button onClick={onLogout}>Log out</button>
        </span>
      </header>
      {project ? (
        <main className="tf-main">
          <CreateIssueForm projectId={project.id} />
          <Board key={project.key} projectKey={project.key} />
        </main>
      ) : (
        <p className="tf-pad">No projects yet.</p>
      )}
    </div>
  );
}

export function App({ uri, initialToken = null }: { uri: string; initialToken?: string | null }) {
  const [token, setToken] = useState<string | null>(initialToken);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  // One client for the app's lifetime; it reads the current token on every request.
  const client = useMemo(() => createApolloClient({ uri, getToken: () => tokenRef.current }), [uri]);

  if (!token) return <LoginForm uri={uri} onLogin={setToken} />;
  return (
    <ApolloProvider client={client}>
      <Shell
        onLogout={() => {
          setToken(null);
          void client.clearStore(); // don't leave one user's data in the cache for the next
        }}
      />
    </ApolloProvider>
  );
}
