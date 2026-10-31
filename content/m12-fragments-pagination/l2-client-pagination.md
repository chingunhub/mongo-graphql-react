---
title: Pagination on the client
minutes: 16
---

On the server, you built `issueConnection(first, after)`. On the client, the question is: when the user clicks **Load more**, where do the next 20 issues *go*? They're the same cache field with different arguments… and by now you know what that means: a **separate** cache entry. Unless you tell the cache otherwise.

## fetchMore

`useQuery` gives you `fetchMore`, which runs the same query with some variables changed:

```tsx
const { data, fetchMore } = useQuery(BOARD_ISSUES, { variables: { key, first: 20 } });
const conn = data?.project.issueConnection;

<button onClick={() => fetchMore({ variables: { after: conn.pageInfo.endCursor } })}>
  Load more
</button>
```

Click it with a default `InMemoryCache` and… the list **replaces** itself with page 2, and Apollo logs a warning about cache data being lost when replacing the field. Why?

```viz-pipeline
{
  title: 'Without a field policy',
  color: 'react',
  input: { label: 'Project:p1', docs: ['$$issueConnection({"first":20}) → edges 1–20'], note: 'Page 1 is cached under a field name that includes its arguments.' },
  stages: [
    { label: 'fetchMore', code: '{ after: "c20" }', docs: ['$$issueConnection({"first":20}) → edges 1–20', '$$issueConnection({"first":20,"after":"c20"}) → edges 21–40'], note: 'Different arguments → a **different cache field**. The component is still watching the first one… (or, if the arguments are ignored, page 2 **overwrites** page 1).' },
  ],
}
```

Apollo needs two pieces of information it can't guess: **which arguments identify "the same list"** (key arguments), and **how to combine pages** (merge).

## Field policies: keyArgs and merge

```ts title="web/apollo.ts"
import { InMemoryCache } from '@apollo/client';
import { relayStylePagination } from '@apollo/client/utilities';

export const cache = new InMemoryCache({
  typePolicies: {
    Project: {
      fields: {
        issueConnection: relayStylePagination(['filter']),
      },
    },
  },
});
```

`relayStylePagination(['filter'])` says:

- **keyArgs: `['filter']`** — only `filter` distinguishes one list from another. `first` and `after` are pagination arguments, not identity. So "TODO issues" and "all issues" are separate lists, but page 1 and page 2 of "all issues" are the **same** list.
- **merge** — when new edges arrive with `after: X`, append them after the edge whose cursor is `X`. It also manages `pageInfo`.

```viz-pipeline
{
  title: 'With relayStylePagination([\'filter\'])',
  color: 'react',
  input: { label: 'Project:p1', docs: ['$$issueConnection({"filter":null}) → edges 1–20, endCursor c20'] },
  stages: [
    { label: 'fetchMore', code: '{ after: "c20" }', docs: ['$$issueConnection({"filter":null}) → edges 1–40, endCursor c40'], note: 'Same list (same `filter`), so the incoming edges are **merged** into it. The component, which watches this one field, re-renders with 40 items.' },
    { label: 'filter: TODO', code: 'new variables', docs: ['$$issueConnection({"filter":null}) → edges 1–40', '$$issueConnection({"filter":{"status":"TODO"}}) → edges 1–20'], note: 'A different `filter` is a different list — its own pages, its own cursor. Switching back to "all" shows the 40 you already loaded, instantly.' },
  ],
}
```

## Writing a field policy yourself

The helpers (`relayStylePagination`, `offsetLimitPagination`, `concatPagination`) cover the common shapes. When yours doesn't fit, write the policy — it's just two pieces:

```ts
Project: {
  fields: {
    issues: {
      keyArgs: ['filter', 'sort'],               // what identifies the list
      merge(existing = [], incoming, { args }) { // how pages combine
        const merged = existing.slice(0);
        const start = args?.offset ?? 0;
        for (let i = 0; i < incoming.length; i++) merged[start + i] = incoming[i];
        return merged;
      },
    },
  },
},
```

Inserting at `offset` (instead of blindly appending) makes the merge **idempotent**: fetching page 2 twice doesn't duplicate it. `existing` and `incoming` contain **references** (`{ __ref: 'Issue:i7' }`) for normalized objects — treat them as opaque values and don't try to read fields off them.

`keyArgs: false` means "no arguments identify the list — there's only one". Forgetting `keyArgs` entirely means *all* arguments are key arguments — the default that gave you the separate-pages problem above.

> [!WARNING]
> `keyArgs` is the most common pagination bug in big Apollo codebases. Too many key args → pages don't merge. Too few → different filters share (and corrupt) one list. When pagination "almost works", check `keyArgs` first.

## The loading state of fetchMore

`fetchMore` returns a promise; while it's in flight the original query's `networkStatus` is `NetworkStatus.fetchMore` (`3`) and `loading` is `true` — but `data` is still there, so keep rendering it (the `loading && !data` rule from Module 10) and show a small "Loading more…" on the button instead of replacing the page with a spinner.

```tsx
const [loadingMore, setLoadingMore] = useState(false);
async function loadMore() {
  setLoadingMore(true);
  try {
    await fetchMore({ variables: { after: pageInfo.endCursor } });
  } finally {
    setLoadingMore(false);
  }
}
```

```quiz
Q: Board issues use `issueConnection(filter, first, after)`. Which keyArgs?
- [ ] `['first', 'after']`
- [x] `['filter']`
- [ ] `false`
> `first` and `after` choose a page; `filter` chooses a list. Only identity arguments are key args.
```

```quiz
Q: "Load more" works, but switching the status filter shows issues from the other filter mixed in. Likely cause?
- [ ] relayStylePagination doesn't support filters
- [x] `keyArgs` doesn't include `filter`, so all filters share (and merge into) one cached list
- [ ] fetchMore must be awaited
> Too few key arguments make different lists collide.
```
