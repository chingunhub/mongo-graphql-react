---
title: "Taskforge: design the schema"
kind: forge
workspace: taskforge
summary: Translate a product spec into SDL — types, nullability, enums, inputs, arguments with defaults — split by domain.
focus: [server/graphql/schema/project.ts, server/graphql/schema/issue.ts, server/graphql/schema/comment.ts, server/graphql/schema/user.ts, server/graphql/schema/index.ts]
needs: [m06/l2-type-system]
---

Schema-first: before any resolver exists, the team agrees on the **contract**. The product spec below is what your PM and frontend dev wrote. Your job is to turn it into SDL that the React app (Part III) will be built against.

The layout follows the lesson — one file per domain, each `extend`ing the roots:

```viz-flow
{
  colWidth: 160,
  rowHeight: 70,
  nodes: [
    { id: 'base', label: 'base.ts', sub: 'type Query/Mutation', col: 0, row: 0.5, color: 'neutral' },
    { id: 'user', label: 'user.ts', sub: 'done for you', col: 1, row: 0, color: 'ok' },
    { id: 'project', label: 'project.ts', sub: 'TODO', col: 1, row: 1, color: 'forge' },
    { id: 'issue', label: 'issue.ts', sub: 'TODO', col: 2, row: 0, color: 'forge' },
    { id: 'comment', label: 'comment.ts', sub: 'TODO', col: 2, row: 1, color: 'forge' },
    { id: 'index', label: 'index.ts', sub: 'typeDefs = [ … ]', col: 3, row: 0.5, color: 'gql' },
  ],
  edges: [
    { from: 'base', to: 'user' }, { from: 'base', to: 'project' },
    { from: 'user', to: 'issue' }, { from: 'project', to: 'comment' },
    { from: 'issue', to: 'index' }, { from: 'comment', to: 'index' },
  ],
}
```

**`schema/user.ts` is finished** — read it first as a worked example. Note how `email` is *nullable* even though every user has one: the spec says only the user themselves and admins may see it, so for everyone else it resolves to `null` (you'll implement that in module 8).

## The spec

"Always present" → non-null. "May be missing / may not exist" → nullable. "A list" → always a list, never containing nulls, unless stated otherwise.

### Enums (in `issue.ts`)

- `IssueStatus`: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`
- `Priority`: `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- `IssueSort`: `NEWEST`, `OLDEST`, `UPDATED`

### `project.ts`

**Project** — `id` (ID), `key` (text), `name` (text), `description` (text — empty string when none), `owner` (a User), `members` (list of Users): all always present. Plus:

- `issues` — list of Issues. Arguments: `filter` (an `IssueFilter`, optional), `sort` (`IssueSort`, defaults to `NEWEST`), `limit` (int, defaults to `20`), `offset` (int, defaults to `0`).
- `issueCount` — an int, always present. Argument: `filter` (optional `IssueFilter`).
- `stats` — a `ProjectStats`, always present.

**ProjectStats** — `total` (int), `byStatus` (list of `StatusCount`), `workload` (list of `Workload`). All always present.
**StatusCount** — `status` (IssueStatus), `count` (int). **Workload** — `user` (User), `open` (int). All always present.

**CreateProjectInput** — `key` and `name` required text, `description` optional text.

Root fields: `projects` (list of Projects), `project(key)` (a Project **that may not exist**; `key` is required text). Mutations: `createProject(input)` → Project (always returned), `addMember(projectId, userId)` → Project (both arguments required IDs).

### `issue.ts`

**Label** — `name`, `color` (text, always present).

**Issue** — always present: `id`, `number` (int), `key` (text like `TF-12`), `title`, `description`, `status`, `priority`, `labels` (list of Labels), `project` (Project), `reporter` (User), `comments` (list of Comments), `commentCount` (int), `createdAt` and `updatedAt` (ISO-8601 text). **May be missing:** `assignee` (User).

**IssueFilter** (input, every field optional) — `status`, `priority`, `assigneeId` (ID; an explicit `null` means "unassigned"), `label` (text), `search` (text).

**LabelInput** — `name` required, `color` optional.
**CreateIssueInput** — `projectId` (required ID), `title` (required), `description`, `priority`, `assigneeId`, `labels` (list of LabelInputs — the list itself optional, items non-null).
**UpdateIssueInput** — every field optional: `title`, `description`, `status`, `priority`, `assigneeId`.

Root fields: `issue(id)` (may not exist). Mutations, all returning a value that's always present: `createIssue(input)` → Issue, `updateIssue(id, input)` → Issue, `deleteIssue(id)` → ID, `addLabel(issueId, label: LabelInput)` → Issue, `removeLabel(issueId, name)` → Issue. All arguments required.

### `comment.ts`

**Comment** — `id`, `body`, `author` (User), `createdAt` (ISO text): all always present. Mutation `addComment(issueId, body)` → Comment, arguments required.

Each root field must be defined in its domain's file with `extend type Query` / `extend type Mutation`. The tests read your schema through introspection — exactly what a frontend tool would see.

## Hints

### Reading the spec as types
"list of Issues, always present, no nulls" → `[Issue!]!`. "a Project that may not exist" → `Project`. "required text argument" → `key: String!`. Defaults go after the type: `sort: IssueSort = NEWEST`.

### Optional list of non-null items
"the list itself optional, items non-null" → `labels: [LabelInput!]` (no outer `!`).

### Cross-file references
`project.ts` can mention `Issue` and `IssueFilter` even though they're defined in `issue.ts` — all files are merged into one schema before it's built. Order in the `typeDefs` array doesn't matter, as long as `base` defines the roots being extended.
