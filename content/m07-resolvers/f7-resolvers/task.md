---
title: "Taskforge: resolvers"
kind: forge
workspace: taskforge
db: true
summary: Connect the schema to your data layer — queries, field resolvers, mutations, and the server factory.
focus: [server/graphql/resolvers/project.ts, server/graphql/resolvers/issue.ts, server/graphql/resolvers/comment.ts, server/graphql/server.ts, server/graphql/resolvers/user.ts, playground.ts]
readonly: [server/graphql/resolvers/util.ts]
needs: [m07/l1-resolver-anatomy, m07/l2-mutations-modules]
---

Your schema is a promise; this step keeps it. Everything you built in Part I gets wired up: the repository's filters become `Project.issues(filter…)`, `createInProject` becomes `createIssue`, the stats service becomes `Project.stats`.

```viz-flow
{
  colWidth: 175,
  rowHeight: 66,
  nodes: [
    { id: 'schema', label: 'schema/*.ts', sub: 'module 6', col: 0, row: 0, color: 'gql' },
    { id: 'res', label: 'resolvers/*.ts', sub: 'you, now', col: 1, row: 0, color: 'forge' },
    { id: 'srv', label: 'server.ts', sub: 'createApolloServer()', col: 2, row: 0, color: 'forge' },
    { id: 'repo', label: 'repositories/', sub: 'module 3, 4', col: 1, row: 1, color: 'mongo' },
    { id: 'svc', label: 'services/stats', sub: 'module 5', col: 0, row: 1, color: 'mongo' },
    { id: 'models', label: 'models/', sub: 'module 1–5', col: 2, row: 1, color: 'mongo' },
  ],
  edges: [
    { from: 'schema', to: 'srv', dashed: true }, { from: 'res', to: 'srv' },
    { from: 'res', to: 'repo' }, { from: 'res', to: 'svc' }, { from: 'res', to: 'models' },
  ],
}
```

**Start by reading** `resolvers/user.ts` (a finished worked example), `resolvers/util.ts` (provided helpers: `idOf`, `toISO`, `notFound`) and `resolvers/project.ts` (its two queries are done). Authentication arrives in module 8 — for now, the context simply contains `currentUser` (the tests pass it in, and so does the playground).

## Your task

### `server.ts`
`createApolloServer()` returns a **new** `ApolloServer` with your `typeDefs` and `resolvers`.

### `resolvers/project.ts`
- `Project.id`, `owner`, `members` (sorted by name).
- `Project.issues(filter, sort, limit, offset)` and `issueCount(filter)` via your repository. GraphQL fills in the SDL defaults; `filter` may be absent or `null`.
- `Project.stats` → `{ total, byStatus }` from `projectStats` **plus** `workload` from your stats service. `Workload.user` loads the user from the row's `userId`.
- `createProject(input)` — the current user becomes the `owner` **and** the first member.
- `addMember(projectId, userId)` — adds without duplicates, returns the project. Unknown or malformed `projectId` → `NOT_FOUND`.

### `resolvers/issue.ts`
- `Query.issue(id)` — `null` for unknown or malformed ids.
- `Issue.id`, `project`, `reporter`, `assignee` (null when unassigned), `comments` (oldest first), `commentCount`, `createdAt`/`updatedAt` (ISO strings), and **`key`** — the project's key and the issue number: `TF-12`.
- `createIssue(input)` — uses `Issue.createInProject`, with the current user as reporter. `assigneeId` → `assignee`. Unknown project → `NOT_FOUND`.
- `updateIssue(id, input)` — via your repository's `updateIssue`. `assigneeId` omitted = leave it; `assigneeId: null` = unassign. Unknown → `NOT_FOUND`.
- `deleteIssue(id)` — deletes the issue **and its comments**, returns the id. Unknown → `NOT_FOUND`.
- `addLabel` / `removeLabel` — via the repository. Unknown issue → `NOT_FOUND`.

### `resolvers/comment.ts`
- `Comment.id`, `author`, `createdAt`.
- `addComment(issueId, body)` — the current user is the author. Unknown issue → `NOT_FOUND`.

Use `notFound('Issue')` / `notFound('Project')` from `util.ts` for the errors.

> [!WARNING]
> Every resolver must hand GraphQL a **Promise**, not a Mongoose Query: end chains with `.exec()` or `await` them. Your repository functions are `async`, so they're already safe.

## Hints

### Reading the parent
In `Issue.*` resolvers, the parent is whatever produced the issue — a full document from `findById`, a document from your repository, or something else later. `issue.project` is an ObjectId (or a populated doc — `idOf` handles both).

### Issue.key
It needs the project's `key`: `Project.findById(idOf(issue.project)).select('key').exec()`, then `` `${project.key}-${issue.number}` ``. Yes, that's one query per issue — you'll see it in module 9's query log, and fix it there.

### Translating inputs
`const { projectId, assigneeId, ...rest } = input;` then build what the model wants. For updates: `if (assigneeId !== undefined) patch.assignee = assigneeId;` — never `||`.
