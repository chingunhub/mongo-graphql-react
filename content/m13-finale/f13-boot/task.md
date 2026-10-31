---
title: "Taskforge: boot the server"
kind: forge
workspace: taskforge
summary: The startup function that turns your modules into a running HTTP server — connect, index, serve, stop.
focus: [server/index.ts]
---

Everything you've built has been exercised through `executeOperation` — the whole GraphQL pipeline, minus HTTP. Now the last piece: a real server that a browser (and the "Launch" button) can talk to.

## Your task

In `server/index.ts`, implement **`startServer({ port, mongoUri })`**:

1. Connect Mongoose to `mongoUri`.
2. Make sure the indexes of `User`, `Project`, `Issue` and `Comment` exist before serving (so uniqueness is enforced from the first request).
3. Create your Apollo server with `createApolloServer()` and start it over HTTP with `startStandaloneServer` from `@apollo/server/standalone`, listening on `port`, with your `buildContext` as the context function.
4. Resolve to `{ url, stop }`:
   - `url` — the URL `startStandaloneServer` gives you,
   - `stop()` — stops the Apollo server **and** disconnects Mongoose.

Nothing may happen at import time — only when `startServer` is called.

The tests start your server on a free port against a fresh database and talk to it with real HTTP requests: anonymous queries, `signUp`, then authenticated requests with the returned token in the `Authorization` header — exactly what the React app will do.

Once this passes, the **⚒ Taskforge** page's **Launch** button starts working: it runs *your* `startServer` and *your* React app together.

## Hints

### The standalone server
```ts
const { url } = await startStandaloneServer(server, {
  listen: { port },
  context: ({ req }) => buildContext({ req }),
});
```
`req` is Node's request object; its `headers` are what your context function already reads.

### Indexes
`Model.syncIndexes()` creates missing indexes (and drops ones no longer in the schema). Run them in parallel with `Promise.all`.
