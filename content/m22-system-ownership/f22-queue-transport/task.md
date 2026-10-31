---
title: 'Relaydesk: own the queue transport'
kind: forge
workspace: relaydesk
summary: 'Own BullMQ readiness, acknowledgement timing and cleanup across partial failures.'
focus: ['services/queue-delivery.ts']
readonly: ['services/queue-contract.ts', 'runtime/queue.ts']
---

Relaydesk's dispatcher trusts one promise. This step decides what that promise means, by writing the adapter between your dispatcher and real BullMQ. The running app delegates to your code from here on.

The factories in `deps` create real ioredis and BullMQ objects in the application. In the grader, they hand you controlled objects, which is how it can stop time at the worst moment.

```viz-sequence
{title:'What the grader will do to you',actors:[{id:'t',label:'Test',color:'forge'},{id:'a',label:'openDelivery',color:'gql'},{id:'r',label:'Resources',color:'mongo'}],steps:[{from:'a',to:'r',label:'connection, queue, events, worker',note:'Each one is created in order, after the ping.'},{from:'t',to:'r',label:'worker never gets ready',note:'Startup fails after three resources exist. All of them must be closed.'},{from:'t',to:'a',label:'deliver, with the worker still busy',note:'The test checks that your promise has **not** resolved.'},{from:'t',to:'a',label:'close twice, one close fails',note:'Everything is attempted, and the failure is still reported.'}]}
```

## Your task

Implement `openDelivery(deps)` in `services/queue-delivery.ts`, using the supplied `DeliveryDependencies` from `queue-contract.ts`.

### 1. Open

1. Create the connection, and await `ping()`.
2. Create Queue, QueueEvents and Worker, in that order.
3. Await all three `waitUntilReady()` promises.
4. Return a handle with `mode: 'BullMQ / Redis'`, `deliver` and `close`.

### 2. `deliver(event)`

Await `deps.enqueue(queue, event)`, then return the result of `job.waitUntilFinished(events, deps.timeoutMs)`. Enqueue and worker errors both reach the caller unchanged.

Once closing has started, refuse new work with an `Error` containing `CLOSED`.

### 3. `close()`

| Rule | Detail |
| --- | --- |
| Order | `worker.close`, `events.close`, `queue.close`, then `connection.disconnect` |
| A failed close | Doesn't skip the rest |
| Any failure | Reject with `AggregateError` |
| Repeated or concurrent calls | Share one cleanup, including when it failed |

### 4. Failed startup

Attempt cleanup of **every resource created so far**, then rethrow the original startup error, even if cleanup failed too.

These deterministic tests explore readiness and partial failure. `npm run verify:redis` also exercises real BullMQ against Memurai. Neither of them replaces the other.

## Hints

### Which variables?
A startup failure can happen with one, two, three or four resources existing. Where do your handles need to live, so that the cleanup can see them?

### A disconnect isn't a close
Look at the types. Is `disconnect` asynchronous? Does your loop handle that?

### Both flags, right now
What's the first line of `close`, before anything is awaited? What should a `deliver` call see if it arrives just after that?
