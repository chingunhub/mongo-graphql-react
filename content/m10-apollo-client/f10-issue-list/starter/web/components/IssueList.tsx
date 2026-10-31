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

// TODO: export const PROJECT_ISSUES = gql`query ProjectIssues(…) { … }`;

export function IssueList({ projectKey }: { projectKey: string }) {
  // TODO
  return <p>TODO</p>;
}
