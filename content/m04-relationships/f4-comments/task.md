---
title: "Taskforge: comments and the issue page"
kind: forge
workspace: taskforge
db: true
summary: A referenced Comment model, virtual populate on Issue, and one function that loads everything the issue page needs.
focus: [server/models/Comment.ts, server/repositories/comments.ts, server/models/Issue.ts, server/repositories/issues.ts, playground.ts]
needs: [m04/l2-virtuals, m04/l1-embed-or-reference]
---

The issue page in Taskforge shows the issue, its project, who reported it, who's assigned, and the discussion underneath. Comments are unbounded and loaded only on this page, so — per the lesson — they get **their own collection**, referencing the issue.

```viz-flow
{
  colWidth: 185,
  rowHeight: 80,
  nodes: [
    { id: 'c', label: 'Comment', sub: 'issue · author · body', col: 0, row: 0, color: 'forge' },
    { id: 'i', label: 'Issue', sub: 'virtual: comments', col: 1, row: 0, color: 'mongo' },
    { id: 'u', label: 'User', col: 0, row: 1, color: 'mongo' },
    { id: 'p', label: 'Project', col: 2, row: 0, color: 'mongo' },
  ],
  edges: [
    { from: 'c', to: 'i', label: 'issue' },
    { from: 'c', to: 'u', label: 'author' },
    { from: 'i', to: 'p', label: 'project' },
  ],
}
```

## Your task

### 1. `server/models/Comment.ts` → export `Comment`

| Field | Rules |
| --- | --- |
| `issue` | reference to `Issue`, required |
| `author` | reference to `User`, required |
| `body` | string, required, trimmed, at most 2000 characters |

Timestamps on. Add an index on `{ issue: 1, createdAt: 1 }` — every comment query filters by issue and sorts by time, and this index serves both.

### 2. `server/models/Issue.ts` (your file — extend it)

- A virtual **`comments`**: the issue's comments, **oldest first**.
- A virtual **`commentCount`**: how many comments the issue has.
- Virtuals included in `toJSON()` and `toObject()`.

### 3. `server/repositories/comments.ts`

- **`addComment(issueId, authorId, body)`** — creates the comment and resolves to it **with `author` populated** (`name` only). If the issue doesn't exist, resolve to `null` and create nothing.
- **`listComments(issueId)`** — the issue's comments, oldest first, each with `author` populated (`name` only).

### 4. `server/repositories/issues.ts` — add `getIssueDetail(id)`

Export a new function that resolves to the issue with:

- `project` populated with `name` and `key`,
- `reporter` and `assignee` populated with `name` and `email`,
- `comments` populated, each comment's `author` populated with `name`,
- `commentCount` populated.

It resolves to `null` for an unknown id **and for a malformed id** like `"not-an-id"` — this function will soon receive ids straight from API requests, so it must not throw a `CastError`.

It also must not get slower as comments pile up: the number of queries should stay the same whether an issue has 2 comments or 200.

## Hints

### Comment virtuals on Issue
Same shape as the lesson: `ref: 'Comment', localField: '_id', foreignField: 'issue'`, with `options: { sort: { createdAt: 1 } }` for order and a second virtual with `count: true`. Schema options can be added after creation with `issueSchema.set('toJSON', { virtuals: true })`.

### Nested populate
`populate({ path: 'comments', populate: { path: 'author', select: 'name' } })` — Mongoose collects all comment authors and fetches them in **one** query. Never loop over comments to load authors.

### Malformed ids
`mongoose.isValidObjectId(id)` tells you whether a value can be cast to an ObjectId. Check it first and return `null` early.
