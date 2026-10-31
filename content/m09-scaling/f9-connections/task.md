---
title: "Taskforge: connections and search"
kind: forge
workspace: taskforge
db: true
summary: A cursor-paginated issueConnection added next to issues (schema evolution), plus a search union with __resolveType.
focus: [server/graphql/pagination.ts, server/graphql/schema/pagination.ts, server/graphql/schema/search.ts, server/graphql/resolvers/search.ts, server/graphql/resolvers/project.ts, server/graphql/schema/index.ts, server/graphql/resolvers/index.ts]
needs: [m09/l2-pagination, m09/l3-architecture]
---

Two features the React board in Part III depends on:

1. **Infinite scroll** for the board → `Project.issueConnection(filter, first, after)`, a Relay-style connection. Added **next to** the existing `issues` field — nothing that works today should break.
2. **A global search box** → `search(term)` returning a mix of projects, issues and people: a **union**.

This step touches the codebase the way real features do: new files, plus small edits to existing ones (registering schema and resolvers, an index on the model). Part of the exercise is finding where each piece belongs.

## Your task

### 1. Schema (new files, then register them in `schema/index.ts`)

`schema/pagination.ts`:
```graphql
type PageInfo { hasNextPage: Boolean!  endCursor: String }
type IssueEdge { cursor: String!  node: Issue! }
type IssueConnection { edges: [IssueEdge!]!  pageInfo: PageInfo!  totalCount: Int! }
```
…and **extend `Project`** with `issueConnection(filter: IssueFilter, first: Int = 20, after: String): IssueConnection!`.

`schema/search.ts`: `union SearchResult = Project | Issue | User` and `extend type Query { search(term: String!): [SearchResult!]! }`.

### 2. `server/graphql/pagination.ts`
- `encodeCursor(issue)` / `decodeCursor(cursor)` — opaque, encoding `createdAt` **and** `_id`; invalid cursors → `BAD_USER_INPUT`.
- `issueConnection(projectId, filter, { first, after })`:
  - newest first (`createdAt` desc, `_id` desc), same filters as `issues` (reuse `buildIssueFilter` from your repository),
  - `first` must be 1–50 (`BAD_USER_INPUT` otherwise), limit+1 for `hasNextPage`,
  - `totalCount` counts all issues matching the filter — but only **if the client asked for it** (no count query otherwise).

Then add the `Project.issueConnection` resolver (in `resolvers/project.ts`) that calls it.

### 3. `server/models/Issue.ts`
Add an index on `{ project: 1, createdAt: -1, _id: -1 }` — it serves exactly this query.

### 4. Search (`resolvers/search.ts`, then register in `resolvers/index.ts`)
- `search(term)`: the trimmed term must be at least 2 characters (`BAD_USER_INPUT`: `Search term must be at least 2 characters`). Case-insensitive, literal "contains" matching (escape it!):
  - up to 5 **projects** whose `name` or `key` matches, by name,
  - up to 5 **issues** whose `title` matches, newest first,
  - up to 5 **users** whose `name` matches, by name,
  - returned in that order: projects, then issues, then users.
- `SearchResult.__resolveType` — tell GraphQL which type each result is.

## Hints

### Lazy totalCount
The default resolver **calls** a parent property if it's a function (module 6). So the connection object can carry `totalCount: () => countIssues(projectId, filter)` — it only runs if `totalCount` was selected.

### Combining the cursor with filters
`buildIssueFilter` may already use keys; wrap both: `{ $and: [buildIssueFilter(projectId, filter), cursorCondition] }`. Cursor condition for a descending (createdAt, _id) sort: `{ $or: [{ createdAt: { $lt: C } }, { createdAt: C, _id: { $lt: I } }] }`.

### __resolveType
`if (obj instanceof Issue) return 'Issue';` and so on, with the model classes imported from `server/models`.
