---
title: "Taskforge: the issue repository"
kind: forge
workspace: taskforge
db: true
summary: Every query the API will need for issues, in one place — filters, sorting, paging, safe updates and labels.
focus: [server/repositories/issues.ts, playground.ts]
needs: [m03/l1-queries, m03/l2-updates]
---

In a big codebase you don't want `Issue.find({...})` sprinkled through fifty resolvers, each building filters slightly differently. You want **one module that owns issue queries**: the repository. When the GraphQL layer arrives in Part II, its resolvers will be thin wrappers around these functions.

```viz-flow
{
  colWidth: 200,
  rowHeight: 70,
  nodes: [
    { id: 'r1', label: 'Project.issues', sub: 'resolver (Part II)', col: 0, row: 0, color: 'gql' },
    { id: 'r2', label: 'Mutation.updateIssue', sub: 'resolver (Part II)', col: 0, row: 1, color: 'gql' },
    { id: 'repo', label: 'repositories/issues.ts', sub: 'you, now', col: 1, row: 0.5, color: 'forge', w: 175 },
    { id: 'm', label: 'Issue model', col: 2, row: 0.5, color: 'mongo' },
  ],
  edges: [
    { from: 'r1', to: 'repo' },
    { from: 'r2', to: 'repo' },
    { from: 'repo', to: 'm' },
  ],
}
```

## Your task

Create the functions in `server/repositories/issues.ts`.

### `buildIssueFilter(projectId, filter = {})`

Returns the MongoDB filter object (no querying). Always restricted to the project. Optional `filter` keys:

| Key | Meaning |
| --- | --- |
| `status`, `priority` | exact match |
| `assigneeId` | a user id string → issues assigned to them. **`null` → unassigned issues.** Not given (`undefined`) → no assignee filter at all. |
| `label` | issues having a label with this name (case-insensitive — label names are stored lowercase) |
| `search` | case-insensitive, literal "title contains" |

### `listIssues(projectId, filter = {}, options = {})`

- `options.sort`: `'NEWEST'` (default, by `createdAt` desc), `'OLDEST'` (`createdAt` asc) or `'UPDATED'` (`updatedAt` desc) — always with a stable tiebreaker.
- `options.limit` (default 20, at most 100) and `options.offset` (default 0).
- Resolves to issue **documents** (the API layer will want virtuals like `id`).

### `countIssues(projectId, filter = {})`

Number of issues matching the same filters.

### `updateIssue(id, patch)`

Applies a partial update and resolves to the **updated** issue, or `null` if it doesn't exist.

- Only these keys may be changed: `title`, `description`, `status`, `priority`, `assignee`. Anything else in `patch` (say, `project` or `number` or `reporter`) is **ignored** — this function will be called with user input.
- Keys that are `undefined` are ignored; `assignee: null` **unassigns**.
- Schema rules must still apply (an invalid status or a 2-character title is rejected).

### `addLabel(issueId, { name, color? })` and `removeLabel(issueId, name)`

- `addLabel` adds the label unless the issue **already has a label with that name** (case-insensitive) — in which case the issue is returned unchanged. Must be safe under concurrency: two simultaneous `addLabel(id, { name: 'bug' })` calls leave exactly one `bug` label.
- `removeLabel` removes the label with that name (case-insensitive).
- Both resolve to the updated issue, or `null` if the issue doesn't exist.

## Hints

### null vs undefined
Check `filter.assigneeId !== undefined` to decide *whether* to filter, then use the value as-is: a string id or `null` both make sense as `{ assignee: value }`.

### A whitelist for updates
Loop over the allowed keys and copy only those that are `!== undefined` from `patch` into a `$set` object. Then `findByIdAndUpdate(id, { $set }, { returnDocument: 'after', runValidators: true })`.

### No duplicate labels, atomically
`$addToSet` compares whole objects, so `{ name: 'bug', color: '#f00' }` and `{ name: 'bug', color: '#00f' }` would both get in. Use a conditional `$push` instead: filter on `{ _id, 'labels.name': { $ne: name } }`. If that returns `null`, either the issue doesn't exist or it already has the label — look it up with `findById` to return the right thing. Lowercase the name yourself in the filter: setters cast filter values on top-level paths, but don't rely on that inside `$ne` on a nested array path.
