---
title: The N+1 problem and DataLoader
minutes: 18
---

Your Taskforge API is correct. Let's see how much work it does. Here's a perfectly ordinary board query:

```graphql
{
  project(key: "TF") {
    issues(limit: 20) {
      key
      title
      assignee { name }
      reporter { name }
      commentCount
    }
  }
}
```

Count the database queries it causes with the resolvers you wrote in module 7:

```viz-flow
{
  title: 'Queries for one board request (20 issues)',
  colWidth: 150,
  rowHeight: 66,
  nodes: [
    { id: 'p', label: 'project', sub: '1', col: 0, row: 1, color: 'mongo' },
    { id: 'i', label: 'issues', sub: '1', col: 1, row: 1, color: 'mongo' },
    { id: 'k', label: 'Issue.key', sub: '20 × Project.findById', col: 2, row: 0, color: 'bad', w: 140 },
    { id: 'a', label: 'Issue.assignee', sub: '≤ 20 × User.findById', col: 2, row: 1, color: 'bad', w: 140 },
    { id: 'r', label: 'Issue.reporter', sub: '20 × User.findById', col: 2, row: 2, color: 'bad', w: 140 },
    { id: 'c', label: 'commentCount', sub: '20 × countDocuments', col: 3, row: 1, color: 'bad', w: 140 },
  ],
  edges: [
    { from: 'p', to: 'i' }, { from: 'i', to: 'k' }, { from: 'i', to: 'a' }, { from: 'i', to: 'r' }, { from: 'i', to: 'c' },
  ],
  steps: [
    { focus: ['p', 'i', 'p>i'], caption: 'Two queries to get the project and its 20 issues. So far so good.' },
    { focus: ['k', 'a', 'r', 'c', 'i>k', 'i>a', 'i>r', 'i>c'], caption: 'Then **each field resolver runs once per issue**: ~80 more queries. Many of them ask for the *same* thing — the same project 20 times, the same 3 people over and over. This is **N+1** (here, more like 4N+2).' },
  ],
}
```

Each query is fast — maybe 1 ms on localhost. In production with 2–5 ms network latency per round trip, and a page that shows 100 issues, this request takes over a second and hammers the database. And nothing in your code *looks* wrong: each resolver is tiny and correct on its own. That's what makes N+1 the classic GraphQL performance bug.

## Why GraphQL is prone to it

Resolvers are written **one field at a time**, without knowing about their siblings. `Issue.assignee` can't see that 19 other `Issue.assignee` calls are happening in the same tick. You *could* populate everything in the root resolver — but then you'd load assignees even for queries that never asked for them, and you'd have to predict every query shape.

What you want is a way for those 20 independent calls to **collapse into one** query behind the scenes. That's DataLoader.

## DataLoader: batch, then cache

```ts
import DataLoader from 'dataloader';

const userById = new DataLoader(async (ids: readonly string[]) => {
  const users = await User.find({ _id: { $in: ids } });
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return ids.map((id) => byId.get(id) ?? null); // same length, same order as `ids`!
});

// in resolvers:
assignee: (issue, _args, ctx) => (issue.assignee ? ctx.loaders.userById.load(String(issue.assignee)) : null),
```

Here's what happens when 20 `Issue.assignee` resolvers each call `load()`:

```viz-sequence
{
  actors: [
    { id: 'r', label: '20 × Issue.assignee', color: 'gql' },
    { id: 'dl', label: 'userById loader', color: 'forge' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'r', to: 'dl', label: "load('u1')", note: 'The first resolver asks for user u1. The loader doesn\'t query yet — it **queues** the key and returns a promise.' },
    { from: 'r', to: 'dl', label: "load('u2'), load('u1'), load('u3')…", note: 'The other resolvers run in the same tick of the event loop. Each `load` adds its key to the queue. Duplicate keys (`u1` again) get the **same** promise.' },
    { from: 'dl', to: 'dl', label: 'end of tick → batch', note: 'When the current tick finishes, DataLoader calls your **batch function once** with all the distinct keys: `["u1", "u2", "u3"]`.' },
    { from: 'dl', to: 'db', label: 'User.find({ _id: { $in: [u1, u2, u3] } })', note: 'One query instead of twenty.' },
    { from: 'db', to: 'dl', label: '3 users (any order)', ret: true },
    { from: 'dl', to: 'r', label: 'resolve each promise', ret: true, note: 'Each waiting resolver gets its user. Within this request, a later `load(\'u1\')` returns instantly from the loader\'s **cache**.' },
  ],
}
```

That sequence is the good case. Here's the same page as a counter, so you can feel the difference. Make your prediction before you step through it, then try the other resolver and a bigger page.

```viz loader-lab
{}
```

### The batch function contract

DataLoader matches results to keys **by position**. Your batch function must return an array with the **same length and order** as the keys it received. MongoDB, of course, returns documents in whatever order it likes, and simply omits ids that don't exist:

```viz-pipeline
{
  title: 'Aligning results with keys',
  color: 'forge',
  input: { label: 'keys', docs: ['$$"u3"', '$$"u9"', '$$"u1"'], note: 'DataLoader asks for u3, u9, u1 — in that order. u9 was deleted last week.' },
  stages: [
    { label: 'User.find($in)', docs: [{ _id: 'u1', name: 'Ada' }, { _id: 'u3', name: 'Linus' }], note: 'MongoDB returns 2 documents, in its own order. If you returned this array as-is, u3 would get Ada, u9 would get Linus, u1 would get nothing. **Silent data corruption.**' },
    { label: 'Map by id', code: 'new Map(users.map(u => [String(u._id), u]))', docs: ['$$"u1" → Ada', '$$"u3" → Linus'] },
    { label: 'keys.map(…)', code: 'ids.map(id => byId.get(id) ?? null)', docs: [{ name: 'Linus' }, '$$null', { name: 'Ada' }], note: 'Back in key order, with `null` for the missing one. **This** is what the batch function returns.' },
  ],
}
```

That `ids.map(id => byId.get(id) ?? null)` line is the most important line in any batch function. Forgetting it is a bug that passes every test with one item.

Also watch the **key type**: ObjectIds aren't `===` equal to each other, and the loader's cache uses `===` (via a Map). Normalize keys to strings — `load(String(issue.assignee))` — or you'll get cache misses and duplicate keys.

### One loader per request

```ts
// ✘ module level: shared by every request, forever
export const userById = new DataLoader(batchUsers);

// ✔ created in the context function, per request
context: async ({ req }) => ({ currentUser: …, loaders: createLoaders() }),
```

DataLoader's cache never expires. A module-level loader would serve stale data forever (rename a user, and the old name lives on) — and worse, could serve data loaded under one user's permissions to another user. **Loaders belong in the context.** The cache then lives exactly as long as one request, which is what you want.

## Loaders that aren't "by id"

The pattern works for anything batchable. Counting comments per issue, for 20 issues, in one aggregation:

```ts
const commentCountByIssue = new DataLoader(async (issueIds: readonly string[]) => {
  const rows = await Comment.aggregate([
    { $match: { issue: { $in: issueIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: '$issue', count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map((r) => [String(r._id), r.count]));
  return issueIds.map((id) => counts.get(id) ?? 0); // issues with no comments: 0, not null
});
```

(Notice the manual ObjectId cast — it's an aggregation, Module 5's trap.)

## DataLoader vs populate

| | `populate()` | DataLoader |
| --- | --- | --- |
| Batches? | yes, per query | yes, per tick, across resolvers |
| Loads only requested fields' data? | no — you choose at the root | yes — field resolvers run only if selected |
| Dedupes across the whole request? | no | yes (per-request cache) |
| Fits GraphQL's field-by-field model? | awkwardly | naturally |

In a GraphQL server, DataLoader is the default tool. Populate still shines in non-GraphQL code paths (scripts, REST endpoints, reports).

```quiz
Q: A batch function receives keys `["a", "b", "c"]` and MongoDB returns documents for `c` and `a`. What must the batch function return?
- [ ] `[docC, docA]`
- [ ] `[docA, docC]`
- [x] `[docA, null, docC]`
- [ ] It should throw because `b` is missing
> Same length and order as the keys. Missing values are `null` (or an `Error` instance if a missing value should fail that one load).
```

```quiz
Q: Why create loaders in the context function instead of once at module level?
- [ ] DataLoader can only be used once
- [x] Its cache never expires: a shared loader would serve stale data and leak results across users
- [ ] Module-level loaders can't batch
> A per-request loader caches for exactly one request. That's enough to dedupe within a query, and short enough to never be stale.
```
