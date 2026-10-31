---
title: "Taskforge: kill the N+1s"
kind: forge
workspace: taskforge
db: true
summary: Per-request DataLoaders for users, projects, comments and comment counts — wired through the context into every field resolver.
focus: [server/graphql/loaders.ts, server/graphql/context.ts, server/graphql/resolvers/types.ts, server/graphql/resolvers/issue.ts, server/graphql/resolvers/project.ts, server/graphql/resolvers/comment.ts, playground.ts]
needs: [m09/l1-n-plus-one, m08/l1-context-auth]
---

Run the playground first. It loads a board of 20 issues with their people, comments and counts, and prints the number of database queries. Then run it again after your refactor. That before/after number is the whole point of this step.

## Your task

### 1. `server/graphql/loaders.ts` — `createLoaders()`

| Loader | Key (string id) | Value |
| --- | --- | --- |
| `userById` | user id | User document or `null` |
| `projectById` | project id | Project document or `null` |
| `commentCountByIssue` | issue id | number of comments (`0` if none) — **one aggregation** |
| `commentsByIssue` | issue id | that issue's comments, **oldest first** (`[]` if none) |

One database call per batch; results in key order.

### 2. Wire them in
- `resolvers/types.ts`: add `loaders` to the `Context` interface (`ReturnType<typeof createLoaders>` works).
- `context.ts`: `buildContext` returns `{ currentUser, loaders: createLoaders() }` — fresh per request.

### 3. Use them in field resolvers
- `Issue.key`, `Issue.project` → `projectById`
- `Issue.reporter`, `Issue.assignee` → `userById`
- `Issue.commentCount` → `commentCountByIssue`; `Issue.comments` → `commentsByIssue`
- `Project.owner`, `Project.members` (`loadMany`, keep them sorted by name), `Workload.user`, `Comment.author` → `userById`

Keep every response identical. The goal: the number of queries for a board **doesn't grow with the number of issues**.

> [!TIP]
> Loader keys must be **strings**: `ctx.loaders.userById.load(String(idOf(issue.reporter)))`. ObjectIds are objects — two equal ids are not `===`, so the loader's cache would miss and keys would repeat.

## Hints

### The shape of a by-id loader
```ts
new DataLoader<string, any>(async (ids) => {
  const docs = await User.find({ _id: { $in: ids } });
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return ids.map((id) => byId.get(id) ?? null);
});
```

### Counting and grouping
Count: `Comment.aggregate` with `$match: { issue: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } }` and `$group`. Group: `Comment.find({ issue: { $in: ids } }).sort({ createdAt: 1, _id: 1 })`, then bucket by `String(c.issue)`.

### members, sorted
`loadMany` returns results in key order, so sort afterwards: `(await ctx.loaders.userById.loadMany(ids)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))`.
