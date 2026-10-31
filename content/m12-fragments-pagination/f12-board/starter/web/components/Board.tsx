import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { IssueCard } from './IssueCard';
import { COLUMNS, toBoard } from '../lib/toBoard';

// TODO: export const BOARD_ISSUES = gql`query BoardIssues(…) { … } ${ISSUE_CARD_FIELDS}`;

export function Board({ projectKey, pageSize = 20 }: { projectKey: string; pageSize?: number }) {
  // TODO
  return <p>TODO: the board</p>;
}
