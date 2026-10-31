---
title: 'Relaydesk: connect the browser to three transports'
kind: forge
workspace: relaydesk
summary: 'Build the real identity-scoped Apollo, REST and tRPC session used by the console.'
focus: ['web/session.ts']
readonly: ['web/session-contract.ts', 'web/App.tsx']
---

So far, the supplied app has owned every network call. From here, it uses your session for all of them, which puts you in charge of the last unowned stretch between a click and the database. Everything that's about *who is asking* now goes through one object, and one object can be replaced in one move.

## Your task

Implement `createSession(options)` in `web/session.ts`, matching `RelaySession` in `web/session-contract.ts`.

### 1. GraphQL

Create a fresh `ApolloClient` and `InMemoryCache` on every call. `Contact` and `Ticket` both use `keyFields: ['tenant', 'id']`. Connect an `HttpLink` to `graphql`, relative to `baseUrl`. Use `options.fetcher` when it's supplied.

`baseUrl` may have a nested path, such as `/projects/relaydesk/reference/`. Every URL must keep it.

### 2. Identity

Copy `headers` at construction, so that later changes by the caller have no effect. Send that same identity on GraphQL, REST and tRPC. Never put identity in a business input.

### 3. Operations

| Method | Transport |
| --- | --- |
| `inbox.accept(input)` | POST `api/intake` |
| `inbox.triage(input)` | the typed tRPC `triage` mutation, under `trpc` |
| `operations.report()` | GET `api/operations` |
| `operations.dispatch(flag)` | POST `api/dispatch` with `{ simulateFailure: flag }` |

REST POSTs set a JSON content type. Parse the JSON, and reject a non-OK response with the server's `error` string, or a clear fallback containing the HTTP status. Return real results, and never turn a failure into an empty list.

### 4. `stop()`

Stop the Apollo client exactly once. After that, every `inbox` and `operations` method rejects with `CLOSED`, **before** sending anything.

```ts
const session = createSession({ baseUrl, headers });
await session.operations.report(); // { tickets: 2, pending: 0, activities: 2 }

session.stop();
session.stop();                    // does nothing the second time
await session.operations.report(); // rejects CLOSED, and fetch was never called
```

The tests use real Apollo HTTP execution and real tRPC decoding, with useful caching, URL prefixes, immutable identity and failures. They're looking at what actually crosses the wire.

## Hints

### Don't repeat yourself
Three of the four operations are the same dance with different paths. What would a small local helper take as arguments?

### The tRPC client
You saw `createTRPCClient` and `httpBatchLink` in Module 18. What's different here? Both accept options for headers and for a custom fetch.

### Reject, not throw
The `triage` method isn't using your helper. Where does its `CLOSED` check go, so that it rejects rather than throws?

### The other half of the error
What should your code do if a non-OK response has a body with no `error` string?
