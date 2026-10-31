import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

const PROJECTS = gql`
  query PickerProjects {
    projects {
      id
      key
      name
    }
  }
`;

const PROJECT_SUMMARY = gql`
  query ProjectSummary($key: String!) {
    project(key: $key) {
      id
      name
      stats {
        total
        byStatus {
          status
          count
        }
      }
    }
  }
`;

function Summary({ projectKey }: { projectKey: string }) {
  const { data, loading, error } = useQuery<any>(PROJECT_SUMMARY, { variables: { key: projectKey } });
  if (loading) return <p>Loading summary…</p>;
  if (error) return <p role="alert">Couldn't load project: {error.message}</p>;
  const project = data?.project;
  if (!project) return <p>Project not found.</p>;
  return (
    <section>
      <h2>{project.name}</h2>
      <p>{project.stats.total} issues</p>
      <ul>
        {project.stats.byStatus.map((s: { status: string; count: number }) => (
          <li key={s.status}>
            {s.status}: {s.count}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectPicker() {
  const [key, setKey] = useState('');
  const { data, loading, error } = useQuery<any>(PROJECTS);

  if (loading) return <p>Loading projects…</p>;
  if (error) return <p role="alert">Couldn't load projects: {error.message}</p>;

  return (
    <div>
      <select aria-label="Project" value={key} onChange={(e) => setKey(e.target.value)}>
        <option value="">Choose a project…</option>
        {data.projects.map((p: { id: string; key: string; name: string }) => (
          <option key={p.id} value={p.key}>
            {p.name}
          </option>
        ))}
      </select>
      {/* Mounting Summary only once a key exists is the same as skip: !key */}
      {key && <Summary projectKey={key} />}
    </div>
  );
}
