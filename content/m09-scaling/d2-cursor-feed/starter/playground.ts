import { createServer } from './server';
import { Post } from './models/Post';

const base = Date.UTC(2026, 9, 1);
await Post.create(
  Array.from({ length: 7 }, (_, i) => ({ author: 'sam', text: `post ${i + 1}`, createdAt: new Date(base + i * 60_000) })),
);

const server = createServer();
const Q = `query($after: String) {
  feed(first: 3, after: $after) {
    edges { cursor node { text } }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}`;

// Walk the feed page by page, the way an infinite scroll would.
let after: string | null = null;
for (let page = 1; page <= 4; page++) {
  const res: any = await server.executeOperation({ query: Q, variables: { after } });
  const feed = res.body.singleResult.data?.feed;
  console.log(`page ${page}:`, feed?.edges.map((e: any) => e.node.text), feed?.pageInfo, res.body.singleResult.errors ?? '');
  if (!feed?.pageInfo.hasNextPage) break;
  after = feed.pageInfo.endCursor;
}
