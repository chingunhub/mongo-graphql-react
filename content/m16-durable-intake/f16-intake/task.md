---
title: "Relaydesk: durable, idempotent intake"
kind: "forge"
workspace: "relaydesk"
db: true
summary: "Create tickets and pending opening events atomically, even under retries."
focus: ["services/tickets/model.ts","services/tickets/intake.ts"]
---

Tickets arrive from outside: an email gateway, a web form, a partner's webhook. Those senders retry when they're unsure, sometimes twice at once. Whatever they do, one external source ID must become one ticket, carrying one pending event. This is the first time Relaydesk stores anything, and everything after this reads from it.

```viz-sequence
{title:'Same source, one ticket',actors:[{id:'a',label:'Retry A',color:'gql'},{id:'t',label:'Tickets',color:'mongo'},{id:'b',label:'Retry B',color:'react'}],steps:[{from:'a',to:'t',label:'ingest (north, mail-77)',note:'No match, so the ticket and its pending event are inserted **as one document**.'},{from:'b',to:'t',label:'ingest (north, mail-77)',note:'Same tenant, same source. Possibly at the very same moment.'},{from:'t',to:'b',label:'the original ticket',ret:true,note:'B gets the ticket A created. Its subject and request ID are ignored, and the event ID stays the same.'}]}
```

## Your task

### 1. The `Ticket` model in `services/tickets/model.ts`

The file already has the TypeScript type. Add a real Mongoose schema:

- `tenant`, `sourceId`, `subject`, `contactId`: required strings. `subject` is trimmed.
- `priority`: `low`, `normal` or `high`, default `normal`.
- `version`: number, default 0.
- `event`: required embedded object with **no subdocument `_id`**. Its strings are all required, `delivered` defaults to false.
- A **unique compound index** on `tenant` and `sourceId`.

Keep the model name `RelayTicket`, and export the record type as the starter does.

### 2. `ingest(ctx, input)` in `services/tickets/intake.ts`

- Call `requireAction(ctx, 'tickets:triage')` first.
- If `sourceId`, `subject` or `contactId` is empty or blank, throw `BAD_INPUT`.
- Trim the subject **only**. `sourceId` and `contactId` are someone else's identifiers, so keep them exactly as received.
- Allocate one ObjectId. Its string is both `event.id` and `event.ticketId`.
- `event.tenant` and `event.requestId` come from the context, `type` is `ticket.opened`, and `delivered` is false.

### 3. Behave under retries

| Call | Result |
| --- | --- |
| A new `(tenant, sourceId)` | a new ticket with a pending event |
| The same pair again | the **original** ticket, unchanged |
| Many at once with the same pair | they all resolve to that one ticket |
| The same `sourceId` in a different tenant | a separate ticket |
| Any other database failure | the error escapes |

The tests create the indexes before racing callers.

## Hints

### Find-then-create?
You know how that story ends. The lesson's `recordVisit` had the right shape. What differs here?

### An `_id` chosen by you
You need the ticket's ID before the write so the event can contain it. What can you pass to `new Types.ObjectId()`, and where does the result go?

### The second caller
What would `$set` do to an existing event? Why is `$setOnInsert` the right operator?

### When the race is lost
A concurrent upsert may throw. Which error means "someone else made it", and what should you do next? What about all the others?
