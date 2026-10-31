import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { IssueCard, ISSUE_CARD_FIELDS, type IssueCardData } from './IssueCard';
import { COLUMNS, toBoard } from '../lib/toBoard';

export const BOARD_ISSUES = gql`
  query BoardIssues($key: String!, $first: Int!, $after: String) {
    project(key: $key) {
      id
      name
      issueConnection(first: $first, after: $after) {
        edges {
          cursor
          node {
            ...IssueCardFields
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
        totalCount
      }
    }
  }
  ${ISSUE_CARD_FIELDS}
`;

export function Board({ projectKey, pageSize = 20 }: { projectKey: string; pageSize?: number }) {
  const [loadingMore, setLoadingMore] = useState(false);
  const { data, loading, error, fetchMore } = useQuery<any>(BOARD_ISSUES, {
    variables: { key: projectKey, first: pageSize },
  });

  if (loading && !data) return <p>Loading board…</p>;
  if (error) return <p role="alert">Couldn't load board: {error.message}</p>;
  const project = data?.project;
  if (!project) return <p>Project not found.</p>;

  const conn = project.issueConnection;
  const issues: IssueCardData[] = conn.edges.map((e: { node: IssueCardData }) => e.node);
  // Columns are derived from each issue's *current* status in the cache —
  // so an optimistic status change moves the card instantly.
  const board = toBoard(issues as any);

  async function loadMore() {
    setLoadingMore(true);
    try {
      await fetchMore({ variables: { after: conn.pageInfo.endCursor } });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <div className="tf-board">
        {COLUMNS.map((col) => (
          <section key={col.status} aria-label={col.label}>
            <h3>
              {col.label} ({board[col.status].length})
            </h3>
            {board[col.status].map((issue: IssueCardData) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </section>
        ))}
      </div>
      <p>
        Showing {issues.length} of {conn.totalCount}
      </p>
      {conn.pageInfo.hasNextPage && (
        <button className="tf-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading more…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
