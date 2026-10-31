---
title: "Drill: the change blast radius"
kind: "drill"
focus: ["affected.ts"]
---

The lesson's `directConsumers` stopped after one hop, so it forgot that `screen` can break when `contracts` changes. This drill finishes the job on a publishing toolchain.

Before you code, try this one on paper. Which projects does a change to `contracts` affect?

```
web → api → contracts
worker → contracts
docs (depends on nothing)
```

Got it? `api`, `contracts`, `web`, `worker`. `docs` isn't affected, and `worker` is only reached because the walk keeps going.

## Your task

### 1. `affected(graph, changed)` in `affected.ts`

Each key in `graph` names a project, and its array lists that project's dependencies. Return the changed projects **plus everything that transitively consumes them**, sorted alphabetically.

```ts
const graph = { web: ['api'], api: ['contracts'], worker: ['contracts'], contracts: [] };

affected(graph, ['api']);       // ['api', 'web']
affected(graph, ['contracts']); // ['api', 'contracts', 'web', 'worker']
affected(graph, []);            // []
```

An unchanged dependency stays out of the answer. In the first call, `contracts` isn't included just because `api` uses it.

### 2. Reject a bad graph

Throw an `Error` containing `Unknown project` if a changed name or **any dependency anywhere in the graph** isn't a key in `graph`. That includes a broken entry that has nothing to do with the change.

### 3. Survive a cycle

Real repositories end up with cycles. Here they're allowed: `{ a: ['b'], b: ['a'] }` must finish, and each project appears once.

Don't mutate `graph` or `changed`. Use the playground to try a diamond (two paths to the same project) and a cycle before you Submit.

## Hints

### Which way am I walking?
You're looking for projects whose dependency list mentions something already in your answer. That's walking against the arrows.

### When do I stop?
You've seen "keep going until nothing changes" before. Ask what you could measure after each pass to know that nothing changed.

### Cycles and diamonds
Both are solved by the same thing: remembering what you've already added. Which built-in collection does that for you?

### The validation trap
If you only check names as your walk reaches them, a broken project that's disconnected from the change will slip through. Do the checking separately, before you start.
