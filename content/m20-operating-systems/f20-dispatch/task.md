---
title: "Relaydesk: dispatch and diagnose pending work"
kind: "forge"
workspace: "relaydesk"
db: true
summary: "Deliver pending opening events with recovery and tenant-scoped operational counts."
focus: ["services/operations.ts"]
---

Tickets have carried a pending event since Module 16, and nothing has been reading them. This step closes the loop. A dispatcher turns debts into delivered events, and a report shows the state of the system. Run it again after an outage, and it just finishes the work.

```viz-pipeline
{
  title: 'One dispatch run',
  color: 'forge',
  input: { label: 'Tickets', docs: 'this tenant only', note: 'event.delivered is false, ordered by _id' },
  stages: [
    { label: 'Build the envelope', code: 'version 1 + the five stored strings', note: 'delivered is storage detail, and the strict schema refuses it.' },
    { label: 'Check it', code: 'openingEvent, tenant, ticketId', note: 'A stored event that disagrees with its ticket is a bug, and it does not get delivered.' },
    { label: 'Deliver', code: 'await deliver(event)', note: 'The promise means the effect completed.' },
    { label: 'Acknowledge', code: 'matchedCount must be 1', note: 'Filter by _id, tenant and event.id.' },
  ],
}
```

## Your task

Both functions live in `services/operations.ts`.

### 1. `dispatchPending(ctx, deliver)`

Require `tickets:triage`. Then, for each of this tenant's undelivered tickets, in `_id` order:

1. Build an event with `version: 1` and the five stored strings: `id`, `tenant`, `ticketId`, `type` and `requestId`.
2. Parse it with `openingEvent`.
3. Verify that `event.tenant` equals `ctx.tenant`, and that `event.ticketId` equals the ticket's `_id` as a string.
4. `await deliver(event)`.
5. Set `event.delivered` to true, with a filter on `_id`, tenant and `event.id`. Require `matchedCount === 1`.

Any failure in those steps counts as one `failed`, and leaves that ticket pending. Keep going with the next ticket. Count `delivered` only after a successful acknowledgement. Return `{ delivered, failed }`.

| Run | Result |
| --- | --- |
| Three pending, all fine | `{ delivered: 3, failed: 0 }` |
| Three pending, the second's delivery fails | `{ delivered: 2, failed: 1 }`, and it's still pending |
| Run again after that | `{ delivered: 1, failed: 0 }` |
| Nothing pending | `{ delivered: 0, failed: 0 }` |

Repeated dispatch must not create duplicate activity receipts. That was Module 19's job, and these two now work together.

### 2. `operationReport(ctx)`

Require `tickets:read`. Return `{ tickets, pending, activities }`, each one a real count scoped to `ctx.tenant`.

## Hints

### Where's the try?
The lesson's `sendAll` had the answer. What about the permission check, does it belong inside or outside that?

### Don't acknowledge in `finally`
It's tempting to put the acknowledgement somewhere it always runs. What would that do to an event whose delivery failed?

### The envelope
Spreading the stored event gets you `delivered` too. What does a strict schema do with that?

### What does the report need?
Three counts that don't depend on each other. How do you run them together? Should pending be calculated, or counted?
