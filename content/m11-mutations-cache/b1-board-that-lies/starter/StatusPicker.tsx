import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';

const SET_STATUS = gql`
  mutation SetStatus($id: ID!, $status: IssueStatus!) {
    updateIssue(id: $id, input: { status: $status }) {
      status
    }
  }
`;

const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

export function StatusPicker({ issue }: { issue: { id: string; key: string; status: string } }) {
  const [setStatus] = useMutation(SET_STATUS);
  return (
    <select
      aria-label={`Status of ${issue.key}`}
      value={issue.status}
      onChange={(e) => setStatus({ variables: { id: issue.id, status: e.target.value } })}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
