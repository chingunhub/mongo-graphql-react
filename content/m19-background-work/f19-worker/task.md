---
title: "Relaydesk: idempotent activity worker"
kind: "forge"
workspace: "relaydesk"
db: true
summary: "Persist one activity receipt per event and enqueue with a stable BullMQ job identity."
focus: ["services/activity/worker.ts"]
---

When a ticket opens, Relaydesk records an activity item. A queue delivers that event, so expect it twice, sometimes in the same millisecond. One opening has to produce one activity, whatever the delivery does.

```viz-sequence
{title:'Two deliveries, one receipt',actors:[{id:'q',label:'Queue',color:'gql'},{id:'w',label:'processOpening',color:'forge'},{id:'db',label:'Activity',color:'mongo'}],steps:[{from:'q',to:'w',label:'event e9',note:'The envelope is parsed **first**. Garbage never reaches storage.'},{from:'w',to:'db',label:'insert (north, e9)',note:'The receipt is the effect. There is no separate "processed" marker.'},{from:'q',to:'w',label:'event e9 again',note:'A retry, a redelivery, or a second worker.'},{from:'w',to:'db',label:'insert (north, e9)',note:'E11000. Someone already did it.'},{from:'w',to:'q',label:'{ id, duplicate: true }',ret:true,note:'The caller gets the **existing** receipt ID, so the job can finish cleanly.'}]}
```

## Your task

The `openingEvent` Zod schema at the top of `services/activity/worker.ts` is your message contract. Leave it alone.

### 1. The `Activity` model

Replace the loose starter schema: `tenant`, `eventId`, `ticketId`, `requestId` and `kind` are all required strings, with a **unique compound index** on tenant and event ID.

### 2. `processOpening(input)`

- Parse the input first.
- Insert a receipt, using `event.type` as `kind` and `event.id` as `eventId`.
- Return `{ id, duplicate: false }`, where `id` is the database ID as a string.

If this event already has a receipt, return the existing ID with `duplicate: true`. Concurrent calls must create exactly one row.

Only a duplicate-key error counts as a duplicate. If you catch one but can't find the matching receipt, rethrow it. Everything else escapes unchanged.

### 3. `enqueueOpening(queue, input)`

Validate with the same schema, then call `queue.add('ticket.opened', event, options)` and return its result:

| Option | Value |
| --- | --- |
| `jobId` | SHA-256 hex of `JSON.stringify([tenant, id])` |
| `attempts` | `4` |
| `backoff` | exponential, delay `250` |
| `removeOnComplete` | `100` |
| `removeOnFail` | `100` |

Why hash? BullMQ custom job IDs can't contain colons, and an event ID may. The hash keeps tenant scope and stays safe in any case.

The queue is injected. Don't open a Redis connection when the module loads, as tests run without Redis.

## Hints

### What's different from the lesson?
`recordReturn` returned a word. You need the ID of a row that some other caller created. What must happen after the catch?

### Node's crypto
`createHash` is already imported. It's a three-step chain. What does each step take?

### The impossible case
You got E11000, but no matching row exists. How could that happen, and why isn't it a duplicate?
