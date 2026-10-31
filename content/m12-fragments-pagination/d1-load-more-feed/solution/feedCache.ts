import { InMemoryCache } from '@apollo/client';

interface Edge {
  cursor: string;
  node: unknown;
}
interface Connection {
  edges: Edge[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  totalCount?: number;
}

export function createFeedCache() {
  return new InMemoryCache({
    typePolicies: {
      Project: {
        fields: {
          issueConnection: {
            // Only `filter` identifies a list; `first`/`after` pick pages of it.
            keyArgs: ['filter'],
            merge(existing: Connection | undefined, incoming: Connection, { args }) {
              if (!existing || !args?.after) return incoming; // a first page replaces
              const seen = new Set(existing.edges.map((e) => e.cursor));
              return {
                ...incoming,
                edges: [...existing.edges, ...incoming.edges.filter((e) => !seen.has(e.cursor))],
              };
            },
          },
        },
      },
    },
  });
}
