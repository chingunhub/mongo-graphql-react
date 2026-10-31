---
title: Architecture for big codebases (and how to find your way in one)
minutes: 18
---

This lesson is less about new APIs and more about **orientation**. Most of your career you'll be working in code you didn't write, at a scale where you can't read all of it. The skill is knowing where things *should* be, recognizing when they aren't, and tracing a behavior from the schema down to the database quickly. Taskforge is now big enough to practice on.

## Layers, and what belongs in each

```viz-flow
{
  colWidth: 200,
  rowHeight: 72,
  nodes: [
    { id: 'schema', label: 'Schema (SDL)', sub: 'the contract', col: 0, row: 0, color: 'gql' },
    { id: 'res', label: 'Resolvers', sub: 'translate + authenticate', col: 0, row: 1, color: 'gql' },
    { id: 'svc', label: 'Services', sub: 'business rules + authz', col: 0, row: 2, color: 'forge' },
    { id: 'repo', label: 'Repositories / models', sub: 'data access', col: 0, row: 3, color: 'mongo' },
    { id: 'db', label: 'MongoDB', col: 0, row: 4, color: 'mongo' },
    { id: 'ctx', label: 'Context', sub: 'user, loaders', col: 1, row: 1, color: 'neutral' },
    { id: 'err', label: 'formatError', sub: 'errors out', col: 1, row: 0, color: 'neutral' },
  ],
  edges: [
    { from: 'schema', to: 'res' }, { from: 'res', to: 'svc' }, { from: 'svc', to: 'repo' }, { from: 'repo', to: 'db' },
    { from: 'ctx', to: 'res', dashed: true }, { from: 'res', to: 'err', dashed: true },
  ],
  steps: [
    { focus: ['schema'], caption: '**Schema**: what clients can ask for. No logic. If you want to know what the system *does*, read this first.' },
    { focus: ['res', 'ctx'], caption: '**Resolvers**: translate between API shapes and domain shapes (`assigneeId` → `assignee`), require a user, call a service or repository, map the result. Thin. If a resolver is 60 lines, logic has leaked up.' },
    { focus: ['svc'], caption: '**Services**: rules that would be the same no matter what API sat on top — a REST endpoint, a CLI, a queue worker. "Only owners add members." "Deleting an issue deletes its comments." Permission checks live here.' },
    { focus: ['repo', 'db'], caption: '**Repositories/models**: how data is stored and queried. Filters, indexes, aggregations. Know nothing about GraphQL or users.' },
    { focus: ['err'], caption: '**Cross-cutting**: context creation, error formatting, logging, loaders. One place each.' },
  ],
}
```

The rule that keeps this healthy: **dependencies point down**. Resolvers import services; services import repositories; repositories never import resolvers. When you see `import { GraphQLError } from 'graphql'` inside a repository, the layering has started to rot.

> [!NOTE] Taskforge's honest compromise
> `services/permissions.ts` throws `GraphQLError`s (via `graphql/errors.ts`) — a service depending on the API layer. It's pragmatic, and many real codebases do it. The cleaner version: services throw **domain errors** (`class ForbiddenError extends Error`), and `formatError` maps them to GraphQL codes. Then the same service works unchanged behind a REST controller. Knowing where the shortcuts are — and that they *are* shortcuts — is part of reading a codebase well.

### Feature folders vs layer folders

Taskforge is organized by **layer** (`models/`, `repositories/`, `graphql/resolvers/`). Many large codebases organize by **feature** instead:

```text
features/
  issues/   schema.ts  resolvers.ts  service.ts  repository.ts  model.ts  issues.test.ts
  projects/ schema.ts  resolvers.ts  service.ts  …
```

Neither is wrong. Layers make cross-cutting changes easy ("add logging to every repository"); features make feature work easy ("everything about issues is in one folder") and scale better past ~50 files per layer. When you join a team, figure out which one it is in the first hour — it tells you where to look for everything else.

## The tracing playbook

A bug report: *"On the TF board, issue TF-12 shows the wrong comment count."* Here's the route, and it works on almost any GraphQL codebase:

```viz-sequence
{
  actors: [
    { id: 'you', label: 'you', color: 'neutral' },
    { id: 'client', label: 'client code', color: 'react' },
    { id: 'schema', label: 'schema', color: 'gql' },
    { id: 'res', label: 'resolver', color: 'gql' },
    { id: 'data', label: 'loader / repo', color: 'mongo' },
  ],
  steps: [
    { from: 'you', to: 'client', label: 'which operation? (network tab / op name)', note: '**1. Find the operation.** In the browser\'s network tab, the request body has `operationName` — e.g. `ProjectBoard`. Search the client code for it. Now you know the exact fields involved: `commentCount`.' },
    { from: 'you', to: 'schema', label: 'grep "commentCount"', note: '**2. Find the field in the schema.** Which type? Arguments? Nullable? `Issue.commentCount: Int!`.' },
    { from: 'you', to: 'res', label: 'Issue: { commentCount }', note: '**3. Find the resolver.** By convention, the `Issue` key in some resolver map. If there isn\'t one, it\'s the **default resolver** — so look at what object the *parent* resolver returned.' },
    { from: 'you', to: 'data', label: 'ctx.loaders.commentCountByIssue', note: '**4. Follow it down.** Into the loader, service or repository. This is usually where the bug is: a filter, a missing ObjectId cast, a misaligned batch function.' },
    { from: 'you', to: 'you', label: 'reproduce with one operation', note: '**5. Reproduce in isolation.** Run just that operation against a local server (`executeOperation` in a test, or the sandbox). Fix, add a test that would have caught it, done.' },
  ],
}
```

Two more places to check when behavior seems to come from nowhere:

- **The context function** — is the user what you think it is? Are loaders shared when they shouldn't be?
- **Plugins, middleware, `formatError`, model hooks** — things that run without anyone calling them. (Mongoose `pre(/^find/)` hooks that silently filter data are a famous source of "the query is right but results are missing".)

## Abstract types: interfaces and unions

Big schemas have fields that return *one of several types*. Taskforge is about to get one: a global search box that finds projects, issues and people.

```graphql
union SearchResult = Project | Issue | User

extend type Query {
  search(term: String!): [SearchResult!]!
}
```

The client asks for type-specific fields with **inline fragments**:

```graphql
{
  search(term: "log") {
    __typename
    ... on Issue { key title }
    ... on Project { key name }
    ... on User { name }
  }
}
```

The server must tell GraphQL which concrete type each result is, with `__resolveType`:

```ts
SearchResult: {
  __resolveType(obj) {
    if (obj instanceof Issue) return 'Issue';
    if (obj instanceof Project) return 'Project';
    if (obj instanceof User) return 'User';
    return null; // → error: abstract type must resolve to an object type
  },
},
```

(`instanceof` works for Mongoose documents. For lean objects you'd need another signal — a field only one type has, or a `__typename` you set yourself.)

An **interface** is the same idea when the types share fields:

```graphql
interface Node { id: ID! }
type Issue implements Node { id: ID!  title: String! }
type Project implements Node { id: ID!  name: String! }
```

Clients can select `id` without a fragment, because the interface guarantees it. Relay's `Node` interface (`node(id: ID!): Node`) is the famous example.

## Guardrails you'll meet in production schemas

- **Query depth / complexity limits** — someone sends `project { issues { project { issues { project { … } } } } }`, 20 levels deep. Libraries reject queries above a cost budget.
- **Persisted queries** — clients send a hash of a pre-registered query instead of the full text; the server only runs known queries.
- **Operation names in logs and metrics** — so "slow request" becomes "`ProjectBoard` is slow".

You won't build those here, but you should recognize them when you see them in a codebase's server setup.

```quiz
Q: A resolver file for `Issue` has 400 lines, including MongoDB filter building and the "who may delete" rule. What's the best refactor?
- [ ] Split it into two resolver files
- [x] Move filters into the repository and permission rules into a service; keep resolvers as translation
- [ ] Move everything into the model as statics
> Each layer has a job. Filters are data access; permission rules are business rules shared by several mutations; resolvers translate.
```

```quiz
Q: `search` returns `[SearchResult!]!` and a Mongoose User document comes back. Without `__resolveType`, what happens?
- [ ] GraphQL guesses from the fields
- [x] An error: the abstract type must resolve to an object type at runtime
- [ ] It's returned as the first type in the union
> GraphQL can't inspect a JS object and know which schema type it is. `__resolveType` (or `isTypeOf` on each type) tells it.
```
