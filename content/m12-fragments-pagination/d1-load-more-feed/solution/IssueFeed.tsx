import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

const FEED_ISSUES = gql`
  query FeedIssues($key: String!, $first: Int!, $after: String, $filter: IssueFilter) {
    project(key: $key) {
      id
      issueConnection(first: $first, after: $after, filter: $filter) {
        edges {
          cursor
          node {
            id
            title
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
`;

export function IssueFeed({ projectKey, pageSize = 10 }: { projectKey: string; pageSize?: number }) {
  const [status, setStatus] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const { data, loading, error, fetchMore } = useQuery<any>(FEED_ISSUES, {
    variables: { key: projectKey, first: pageSize, filter: status ? { status } : null },
  });

  const conn = data?.project?.issueConnection;

  async function loadMore() {
    setLoadingMore(true);
    try {
      await fetchMore({ variables: { after: conn.pageInfo.endCursor } });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section>
      <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {loading && !conn ? (
        <p>Loading issues…</p>
      ) : error ? (
        <p role="alert">Couldn't load issues: {error.message}</p>
      ) : conn ? (
        <>
          <ul aria-label="Issues">
            {conn.edges.map((e: { cursor: string; node: { id: string; title: string } }) => (
              <li key={e.node.id}>{e.node.title}</li>
            ))}
          </ul>
          <p>
            Showing {conn.edges.length} of {conn.totalCount}
          </p>
          {conn.pageInfo.hasNextPage && (
            <button onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading more…' : 'Load more'}
            </button>
          )}
        </>
      ) : (
        <p>Project not found.</p>
      )}
    </section>
  );
}
