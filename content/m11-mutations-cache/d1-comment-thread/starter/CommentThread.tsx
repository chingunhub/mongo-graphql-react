import { useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';

// TODO: const ISSUE_COMMENTS = gql`query IssueComments(…) { … }`;
// TODO: const ADD_COMMENT = gql`mutation AddComment(…) { … }`;

export function CommentThread({ issueId, currentUser }: { issueId: string; currentUser: { id: string; name: string } }) {
  // TODO
  return <p>TODO</p>;
}
