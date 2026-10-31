---
title: "Relaydesk: start, integrate and recover"
kind: "forge"
workspace: "relaydesk"
summary: "Own the lifecycle and prove the whole application over real HTTP."
focus: ["services/lifecycle.ts"]
readonly: ["runtime/auth.ts","runtime/queue.ts","runtime/serve.ts","runtime/start.ts","runtime/seed.ts","runtime/cli.ts","web/operations.ts","web/main.tsx","web/App.tsx","web/style.css","web/generated/graphql.ts","schema.graphql","codegen.ts","web/assets.d.ts"]
---

This one's a milestone. There are only a few lines to write, and they decide whether everything you've built since Module 14 stands up together. The grader doesn't substitute any reference code: it boots **your** intake, **your** subgraphs, **your** triage, **your** worker and **your** dispatcher, on a real port, with a fresh database.

The transport adapters are supplied, and marked read-only. Your earlier domain modules are what's behind them.

## Your task

Implement `boot(deps)` in `services/lifecycle.ts`, where `deps` is `{ connect, ensureIndexes, serve, disconnect }`.

### 1. Start

Await `connect()`, then `ensureIndexes()`, then `serve()`. Return `{ url, stop }`, where `url` is the one that `serve` gave you.

### 2. Fail to start

If any of those three rejects, attempt `disconnect()`, and rethrow the **original** error, even if the disconnect fails too. `serve` cleans up anything it partly opened, so that's not your concern.

### 3. Stop

| Rule | Detail |
| --- | --- |
| Order | Await the server's `stop`, then `disconnect` |
| Failed stop | `disconnect` still runs, and the failure still reaches the caller |
| Repeated or concurrent calls | One shared cleanup, with each resource closed once |

```ts
const running = await boot(deps);
await Promise.all([running.stop(), running.stop()]);
// server.stop and disconnect each ran exactly once
```

### 4. Then see what it does

The tests inject failures into this lifecycle first. After that, they start your whole project on an ephemeral port and check authentication, cross-tenant identity, repeated intake, federated contact lookup, real tRPC triage over HTTP, stale versions, delivery failure and recovery, and released ports.

If one of those fails, the bug is probably in an earlier file. That's real integration work, so trace it from the failing assertion back through the boundary.

Once this passes, launch your Relaydesk from its project page. Your project uses its own database, separate from the reference demo. Then finish **the final investigation** from the lesson. A green result here is evidence, and it doesn't replace being able to explain the behavior.

## Hints

### Keeping the two paths apart
Starting and stopping are different stages. Where does the `try` for startup end? Should `stop` live inside it?

### Which error reaches the caller?
Look at the lesson's compare. What happens to the `throw` if the cleanup rejects first?

### Sharing the cleanup
You've seen `closeOnce`. What should its work be here, and how do you make both steps run when the first one rejects?
