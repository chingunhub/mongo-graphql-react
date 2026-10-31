---
title: "Drill: a load-more feed, merge written by hand"
kind: drill
env: dom
summary: Write the cache field policy for a cursor connection yourself — keyArgs, merging edges and pageInfo, deduping — then build the feed on it.
focus: [feedCache.ts, IssueFeed.tsx, preview.tsx]
readonly: [preview.tsx]
preview: preview.tsx
---

Apollo ships `relayStylePagination()` for connections — and you'll use it in the forge step. But a helper you can't explain is a helper you can't debug. So here you write the same thing **by hand**, then build a feed on top of it.

## Your task

### 1. `feedCache.ts` — `createFeedCache()`
Return an `InMemoryCache` with a field policy for `Project.issueConnection`:

- **keyArgs**: only `filter` identifies a list (`first` and `after` select pages).
- **merge(existing, incoming, { args })**:
  - no `args.after` → it's a first page: **replace** whatever was there with `incoming`;
  - with `args.after` → keep the existing edges and **append** the incoming edges, skipping any edge whose `cursor` is already present (clicking "Load more" twice must not duplicate items);
  - `pageInfo` and `totalCount` come from `incoming`.

Don't import `relayStylePagination` — that's the point.

### 2. `IssueFeed.tsx` — `IssueFeed({ projectKey, pageSize = 10 })`
- A `<select>` labelled **`Status filter`** (`""` = all, plus the four statuses), sent as `filter: { status }` (or `null` for all).
- A list labelled **`Issues`** with each issue's `title` in an `<li>`.
- A paragraph `Showing 10 of 23` (edges loaded / `totalCount`).
- A **`Load more`** button while `pageInfo.hasNextPage` is true, which fetches the next page with `after: endCursor`; while that's in flight the button reads **`Loading more…`** and is disabled.
- `Loading issues…` only when there's no data yet.

Operation name: **`FeedIssues`**, variables `$key`, `$first`, `$after`, `$filter`. Select `edges { cursor node { id title } }`, `pageInfo { hasNextPage endCursor }` and `totalCount` (plus the project's `id`).

## Hints

### Shape of the policy
```ts
new InMemoryCache({
  typePolicies: {
    Project: {
      fields: {
        issueConnection: {
          keyArgs: ['filter'],
          merge(existing, incoming, { args }) { … },
        },
      },
    },
  },
});
```

### Deduping edges
Edges are plain objects (`{ cursor, node: { __ref } }`) — compare by `cursor`: `const seen = new Set(existing.edges.map((e) => e.cursor))`, then keep `incoming.edges.filter((e) => !seen.has(e.cursor))`.

### fetchMore and variables
`fetchMore({ variables: { after: pageInfo.endCursor } })` keeps the other variables (`key`, `first`, `filter`). Your merge then appends.
