---
title: "A green unit test is one piece of evidence"
minutes: 26
---

You've got a lot of locally correct pieces. Every test is green. Does the system work?

You can't say yet, and that's not pessimism. Unit tests can't see that the gateway started before its subgraphs, or that indexes didn't exist for the first request, or that a failed start left port 4820 occupied so that the next attempt dies with `EADDRINUSE`. All of those are bugs in the *spaces between* your pieces.

This lesson is about those spaces.

## Startup is a dependency sequence

Each step relies on the one before it:

```viz-sequence
{title:'Start, serve, unwind',actors:[{id:'boot',label:'Lifecycle',color:'forge'},{id:'db',label:'MongoDB',color:'mongo'},{id:'http',label:'HTTP graph',color:'gql'}],steps:[{from:'boot',to:'db',label:'connect',note:'Configuration is valid before you get here. A bad URL should fail early and clearly.'},{from:'boot',to:'db',label:'create indexes',note:'The first request needs the same constraints as the thousandth. A unique index that is still building protects nothing.'},{from:'boot',to:'http',label:'start + compose',note:'A port opened by one subgraph is **not** readiness of the whole graph.'},{from:'http',to:'boot',label:'ready URL',ret:true,note:'Only now is it true to say the service is ready.'},{from:'boot',to:'http',label:'stop accepting work',note:'Shutdown runs in reverse order, so that nothing is still using what you are about to close.'},{from:'boot',to:'db',label:'disconnect',note:'Close transport before storage. A failed transport close must not skip this.'}]}
```

Shutting down reverses the order, for the same reason you take your socks off before your feet. Anything still accepting requests needs the database.

## Failing halfway

Startup can fail at any step, and that's where the leaks come from. If `serve()` rejects after MongoDB connected, who closes the connection? Whoever opened it. Ownership includes the failure path.

Which error should the caller see? There's a subtle trap:

```compare
--- ✘ Cleanup hides the cause
try {
  await serve();
} catch (error) {
  await disconnect(); // ✘ if this rejects...
  throw error;        // ✘ ...this never runs
}
// Your log says "disconnect failed".
// Nobody ever learns that the port was busy.
--- ✔ The startup error wins
try {
  await serve();
} catch (error) {
  try {
    await disconnect();
  } catch {
    // the original failure is the one that explains this
  }
  throw error;
}
```

And while stopping, a failed step must not skip the next one. `finally` was made for that: `try { await server.stop(); } finally { await disconnect(); }`.

## Closing once

What happens if two signals arrive, or a test calls `stop()` twice? Closing a closed server throws on a good day, and hangs on a bad one. The neat trick is to remember the *promise*, rather than a boolean:

```ts
// @worked-example close-once
export function closeOnce(close: () => Promise<void>) {
  let closing: Promise<void> | undefined;
  return () => (closing ??= close());
}
```

`??=` assigns only if the value is null or undefined. So the first caller starts the work, and every later caller gets the very same promise, whether it's still running, finished or rejected.

A boolean can't do this. With `if (closed) return`, a concurrent second caller returns immediately, and it thinks cleanup finished when it's still running.

```quiz
Q: HTTP startup fails after MongoDB connects. What must cleanup do?
- [ ] Leave the database connection open for the next attempt
- [x] Close resources acquired during the failed startup, and rethrow the startup error
- [ ] Mark the service ready because the database works
> Resource ownership includes failure paths. The final forge tests deliberately reject startup and shutdown operations to verify this.
```

## Your evidence ladder

Each rung proves something that the rung below can't.

| Rung | Proves | Can't tell you |
| --- | --- | --- |
| Pure policy tests | Order, permissions, retry budget | Anything about storage |
| Storage tests | Indexes, races, stable receipts | Whether transports call them |
| Contract tests | Real composition, real tRPC parsing | Anything about HTTP |
| UI tests | Loading, failure, retry, stale data | The real server's responses |
| HTTP integration | Credentials, headers, lifecycle | A real queue |
| Live queue integration | Redis, BullMQ, retries | A browser |
| Browser checks | What a person actually sees | Rare crashes |

The most common way to fool yourself is to quietly promote a low rung. **A mocked `queue.add` isn't a Redis integration test.** When you say something's verified, say which rung.

## Run what you built

The Relaydesk page can export the reference workspace or your own saved one, labeled separately. The learner export never fills unfinished code with reference answers.

From an exported folder:

```bash
npx pnpm@9.12.3 install
npx pnpm@9.12.3 run build
npx pnpm@9.12.3 start
```

If you have pnpm 9 installed already, plain `pnpm` works too. The README lists the local credentials and the optional Memurai mode. For a change you'd want reviewed, run the typecheck, generate contracts, exercise the behavior, and read the diff.

## The final investigation

Now do what an engineer does on their first week with this system. On your running project, try each of these and predict the result **before** you press anything:

| Step | Predict |
| --- | --- |
| Create a ticket, then submit the same source key | Same ticket, or a second one? |
| Query its contact through the composed graph | Which service answers which field? |
| Triage at version 0, then repeat that same call | What error, and why is it the right one? |
| Simulate a delivery failure, then look at the report | What's pending? |
| Recover | How many activities now? |
| Switch tenant and reuse the source key | Is it the same record? |

Then write an incident note, using the template from the last module, that answers:

- How can a receipt exist while its ticket is still pending?
- Which invariant prevents a second receipt?
- Name one guarantee this local project does **not** provide, and how you'd test it.

Check it by reading it the next day. If "because it works" appears anywhere, you've got more investigating to do.

```quiz
Q: Two shutdown signals arrive close together. Why memoize the promise, rather than a closed boolean?
- [ ] Booleans are slower
- [x] So that the second caller waits for the same cleanup, rather than returning while it is still running
- [ ] So that cleanup runs twice
> With a boolean, the second caller returns at once, and whoever awaited it thinks everything's closed. A shared promise tells the truth to everyone.
```

## What's next

The final forge step of this arc is small in code and large in reach. It boots everything you've built, on real ports, against a real database.
