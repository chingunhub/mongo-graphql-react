import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { StatusPicker } from './StatusPicker';
import { NewIssueForm } from './NewIssueForm';

export const PROJECT_ISSUES = gql`
  query ProjectIssues($key: String!) {
    project(key: $key) {
      id
      name
      doneCount: issueCount(filter: { status: DONE })
      issues(limit: 50) {
        id
        key
        title
        status
      }
    }
  }
`;

export function IssueBoard({ projectKey }: { projectKey: string }) {
  const { data, loading, error } = useQuery<any>(PROJECT_ISSUES, { variables: { key: projectKey } });
  if (loading) return <p>Loading…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  const project = data.project;
  return (
    <section>
      <h2>{project.name}</h2>
      <p>Done: {project.doneCount}</p>
      <NewIssueForm projectId={project.id} />
      <ul aria-label="Issues">
        {project.issues.map((issue: any) => (
          <li key={issue.id}>
            {issue.key} {issue.title} <StatusPicker issue={issue} />
          </li>
        ))}
      </ul>
    </section>
  );
}
