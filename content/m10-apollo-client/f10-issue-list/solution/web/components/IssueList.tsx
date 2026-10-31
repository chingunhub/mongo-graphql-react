import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

export const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'DONE', label: 'Done' },
];

export const PROJECT_ISSUES = gql`
  query ProjectIssues($key: String!, $status: IssueStatus) {
    project(key: $key) {
      id
      name
      issues(filter: { status: $status }, limit: 50) {
        id
        key
        title
        status
        priority
        assignee {
          id
          name
        }
      }
    }
  }
`;

interface IssueRow {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  assignee: { id: string; name: string } | null;
}

export function IssueList({ projectKey }: { projectKey: string }) {
  const [status, setStatus] = useState('');
  const { data, loading, error } = useQuery<any>(PROJECT_ISSUES, {
    variables: { key: projectKey, status: status || null },
  });

  const filter = (
    <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)}>
      {STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  // The filter stays mounted while results reload, so it never flickers away.
  return (
    <section>
      {filter}
      <IssueListBody loading={loading} error={error} project={data?.project} />
    </section>
  );
}

function IssueListBody({ loading, error, project }: { loading: boolean; error?: { message: string }; project?: any }) {
  // Refetches also set loading — keep showing the current data while it refreshes.
  if (loading && !project) return <p>Loading issues…</p>;
  if (error) return <p role="alert">Couldn't load issues: {error.message}</p>;
  if (!project) return <p>Project not found.</p>;
  const issues: IssueRow[] = project.issues;
  return (
    <>
      <h2>{project.name}</h2>
      {issues.length === 0 ? (
        <p>No issues match.</p>
      ) : (
        <ul aria-label="Issues">
          {issues.map((issue) => (
            <li key={issue.id}>
              <strong>{issue.key}</strong> {issue.title} · {issue.priority} · {issue.assignee?.name ?? 'Unassigned'}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
