import { useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// TODO: export const CREATE_ISSUE = gql`mutation CreateIssue(…) { … }`;

export function CreateIssueForm({ projectId }: { projectId: string }) {
  // TODO
  return <p>TODO: create form</p>;
}
