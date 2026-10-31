import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';

export const STATUSES = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'DONE', label: 'Done' },
];

export const UPDATE_ISSUE_STATUS = gql`
  mutation UpdateIssueStatus($id: ID!, $status: IssueStatus!) {
    updateIssue(id: $id, input: { status: $status }) {
      id
      status
    }
  }
`;

export function StatusSelect({ issue }: { issue: { id: string; key: string; status: string } }) {
  const [updateStatus, { error }] = useMutation(UPDATE_ISSUE_STATUS);

  async function change(status: string) {
    try {
      await updateStatus({
        variables: { id: issue.id, status },
        // Instant feedback on the entity; rolled back automatically if the server says no.
        optimisticResponse: { updateIssue: { __typename: 'Issue', id: issue.id, status } },
        // The issue may now belong to different filtered lists — let the server recompute them.
        refetchQueries: ['ProjectIssues'],
      });
    } catch {
      /* rendered via `error` */
    }
  }

  return (
    <span>
      <select aria-label={`Status of ${issue.key}`} value={issue.status} onChange={(e) => change(e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert">
          {' '}
          Couldn't update {issue.key}: {error.message}
        </span>
      )}
    </span>
  );
}
