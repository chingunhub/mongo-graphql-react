import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

// TODO: const FEED_ISSUES = gql`query FeedIssues(…) { … }`;

export function IssueFeed({ projectKey, pageSize = 10 }: { projectKey: string; pageSize?: number }) {
  // TODO
  return <p>TODO</p>;
}
