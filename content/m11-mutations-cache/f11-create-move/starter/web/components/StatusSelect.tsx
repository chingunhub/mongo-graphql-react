import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';

export const STATUSES = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'DONE', label: 'Done' },
];

// TODO: export const UPDATE_ISSUE_STATUS = gql`mutation UpdateIssueStatus(…) { … }`;

export function StatusSelect({ issue }: { issue: { id: string; key: string; status: string } }) {
  // TODO
  return null;
}
