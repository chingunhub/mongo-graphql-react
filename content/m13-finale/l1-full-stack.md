---
title: Wiring it all together
minutes: 16
---

Every layer of Taskforge exists. What's missing is the part that's usually invisible in tutorials and very visible in real codebases: the **startup** code that turns modules into a running server, and the **habit** of shipping a feature through all the layers without breaking any of them. That's this module. Then you launch it.

## What happens when a server starts

```viz-sequence
{
  actors: [
    { id: 'main', label: 'entry point', color: 'neutral' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
    { id: 'apollo', label: 'Apollo Server', color: 'gql' },
    { id: 'http', label: 'HTTP listener', color: 'gql' },
  ],
  steps: [
    { from: 'main', to: 'main', label: 'read config', note: 'Port, database URI, token secret — from **environment variables**, never hard-coded. Fail fast if a required one is missing.' },
    { from: 'main', to: 'db', label: 'mongoose.connect(uri)', note: 'Connect once. If this fails, crash: a server that accepts requests but can\'t reach its database is worse than one that isn\'t up.' },
    { from: 'main', to: 'db', label: 'syncIndexes()', note: 'Make sure unique indexes exist **before** taking traffic — they\'re how uniqueness is enforced (Module 2).' },
    { from: 'main', to: 'apollo', label: 'createApolloServer()', note: 'Your factory from Module 7: typeDefs, resolvers, formatError.' },
    { from: 'main', to: 'http', label: 'startStandaloneServer(server, { context })', note: 'Wires your `buildContext` (Module 8/9) into every request and starts listening.' },
    { from: 'http', to: 'main', label: 'url', ret: true, note: 'Ready. Log the URL. Return a `stop()` so tests and shutdown handlers can close everything cleanly.' },
  ],
}
```

```ts title="server/index.ts (shape)"
export async function startServer({ port, mongoUri }) {
  await mongoose.connect(mongoUri);
  await Promise.all([User, Project, Issue, Comment].map((m) => m.syncIndexes()));
  const server = createApolloServer();
  const { url } = await startStandaloneServer(server, {
    listen: { port },
    context: ({ req }) => buildContext({ req }),
  });
  return { url, stop: async () => { await server.stop(); await mongoose.disconnect(); } };
}
```

Notice what this file **doesn't** do: it doesn't run on import. It exports a function. A separate tiny entry point calls it with real config (`startServer({ port: Number(process.env.PORT), mongoUri: process.env.MONGO_URI })`), tests call it with test config, and nothing starts by accident when a module is imported for a type. You've been following that rule since `createApolloServer()`.

### Standalone vs. middleware

`startStandaloneServer` gives you a complete HTTP server for `/graphql` with sensible defaults (JSON parsing, CORS). When an app needs more routes on the same server — health checks, webhooks, file uploads, cookie sessions — teams switch to the **Express integration**, mounting Apollo as middleware next to other routes. Same `ApolloServer`, same resolvers, same context function; only the HTTP shell changes. If you open a big codebase and see `expressMiddleware(server, { context })`, that's all it is.

### CORS, in one paragraph

A browser page at `http://localhost:5173` calling an API at `http://localhost:4000` is a **cross-origin** request; the browser only allows it if the API's response says that origin is OK (`Access-Control-Allow-Origin`). The standalone server allows any origin by default — fine locally, too permissive for production. In this course the platform proxies `/mine/graphql` to your server, so the browser sees one origin and CORS never comes up — which is also a common production setup (a reverse proxy in front of both).

## A production checklist you can now read

You don't need to build all of these here, but you should recognize them in a real codebase's startup and config:

| Concern | Where you've seen it / what to look for |
| --- | --- |
| Secrets | `TOKEN_SECRET` from env; never in the repo |
| Error masking | `formatError` (Module 8) — Apollo won't do it for you |
| Indexes | `syncIndexes` at startup, or migrations in deploy |
| N+1 | DataLoaders in the context (Module 9) |
| Abuse | page size caps (Module 9), rate limits on `login`, query depth/complexity limits |
| Introspection | Apollo disables it when `NODE_ENV=production` unless you opt in |
| Observability | operation names in logs, request ids in the context |
| Graceful shutdown | `stop()` on SIGTERM: finish in-flight requests, close the DB |

## Shipping a feature through every layer

Here's the skill this whole course has been building toward. A product ask: **"Issues should have due dates, and the board should flag overdue ones."** In a big codebase that's a change in eight files across three layers — and the danger isn't any single change, it's forgetting one:

```viz-flow
{
  title: 'Where "due dates" touches Taskforge',
  colWidth: 170,
  rowHeight: 74,
  nodes: [
    { id: 'model', label: 'models/Issue.ts', sub: 'dueDate field', col: 0, row: 0, color: 'mongo' },
    { id: 'repo', label: 'repositories/issues.ts', sub: 'overdue filter, patch', col: 0, row: 1, color: 'mongo', w: 160 },
    { id: 'sdl', label: 'schema/issue.ts', sub: 'dueDate, isOverdue, inputs', col: 1, row: 0, color: 'gql', w: 160 },
    { id: 'res', label: 'resolvers/issue.ts', sub: 'parse & format dates', col: 1, row: 1, color: 'gql' },
    { id: 'frag', label: 'IssueCard.tsx', sub: 'fragment + badge', col: 2, row: 0, color: 'react' },
    { id: 'form', label: 'CreateIssueForm.tsx', sub: 'date input', col: 2, row: 1, color: 'react', w: 160 },
  ],
  edges: [
    { from: 'model', to: 'repo' }, { from: 'model', to: 'sdl', dashed: true }, { from: 'sdl', to: 'res' },
    { from: 'repo', to: 'res' }, { from: 'sdl', to: 'frag', dashed: true }, { from: 'res', to: 'form', dashed: true },
  ],
  steps: [
    { focus: ['model', 'repo'], caption: '**Data first.** Store it (a real `Date`, default `null`), make it filterable, make it patchable. Your repository\'s whitelist means a new field isn\'t updatable until you add it — a feature, not a bug.' },
    { focus: ['sdl', 'res'], caption: '**Then the contract.** Decide the API shape (a date-only string, a computed `isOverdue`), add it to the inputs, and translate in resolvers: parse incoming strings, format outgoing Dates, reject garbage as `BAD_USER_INPUT`.' },
    { focus: ['frag', 'form'], caption: '**Then the UI.** Thanks to colocation, the card only changes its own fragment; every page showing cards picks it up. The form sends the new input field.' },
  ],
}
```

Order matters: **data → contract → UI**, so each layer builds on something that exists, and you can test each layer as you go. And the tests you've been reading for twelve modules are exactly the safety net that makes a cross-cutting change like this calm instead of scary.

### Dates are a trap (one more time)

The API exposes `dueDate` as `"2026-10-31"` — a **date**, not a timestamp. Store it as midnight UTC, format it back with `toISOString().slice(0, 10)`, and compare "overdue" against **the start of today in UTC**. Mixing time zones here is the classic bug where something is "overdue" at 7pm in one city and not another. Being explicit about what a value *means* (a calendar date vs. an instant) prevents a whole family of bugs.

## How to keep going

You can now find your way around most GraphQL + Mongo + React codebases. Things you'll meet next, now with a place to hang them:

- **GraphQL Code Generator** — generates TypeScript types for every operation and fragment from your schema. Big codebases nearly always use it; it turns many runtime bugs from this course into compile errors.
- **Data masking + `useFragment`** — the next step of colocation (Module 12).
- **Subscriptions** — server push over WebSockets, for live boards.
- **Transactions** — multi-document atomicity in MongoDB, for when one conditional update isn't enough.

Last thing before you write `startServer`: go back and skim the welcome lesson's stack map. Every box in it is now code you wrote.
