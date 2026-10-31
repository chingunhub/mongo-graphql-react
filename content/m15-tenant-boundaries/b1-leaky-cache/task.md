---
title: "Bug hunt: the query is scoped, the answer is not"
kind: "bughunt"
focus: ["context.ts"]
---

A support engineer sends you this:

> South opened record `r1` and saw **North's** title. The repository filters by tenant, I checked twice. There's no South query in the logs at all.

That last sentence is your best clue.

## Your task

Fix `createContext` in `context.ts` so South gets South's data, and each request owns its own cache.

- Keep the public shape: `createContext(tenant, fetchRows)` returns `{ loadRecord }`.
- Keep batching within one request. Two `loadRecord` calls in the same tick should still make one fetch.
- Don't remove caching, and don't change the repository. Neither of them is the bug.

Before you Submit, add a two-request experiment to `playground.ts`: load the same ID as `north`, then as `south`, and print both. See it fail first. Then explain to yourself why South's query never appeared.

## Hints

### Follow the variables
Which variables in `context.ts` are still alive after `createContext` returns?

### Whose tenant is it?
Look at which `tenant` the batch function actually sees. Is it the one from the request being served?

### A second North request
Suppose your fix keeps one loader per tenant. North's second request would still read stale rows from the first. Is that OK for a request-scoped cache?
