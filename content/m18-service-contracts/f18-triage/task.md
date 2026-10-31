---
title: "Relaydesk: a guarded triage service"
kind: "forge"
workspace: "relaydesk"
db: true
summary: "Use tRPC input validation and atomic version checks to update ticket priority."
focus: ["services/triage.ts"]
---

Two agents have the same ticket open. One sets it to high, and the other sets it to low a second later, based on what they saw a minute ago. Without care, the last click wins and nobody knows that a decision was thrown away. This step makes that collision visible, and it reuses three things you've already built.

```viz-sequence
{title:'Two agents, one ticket',actors:[{id:'a',label:'Agent A',color:'gql'},{id:'t',label:'Ticket v2',color:'mongo'},{id:'b',label:'Agent B',color:'react'}],steps:[{from:'a',to:'t',label:'priority high, expected 2',note:'Matches. Priority changes and the version goes to 3, in one atomic update.'},{from:'b',to:'t',label:'priority low, expected 2',note:'Agent B is deciding from old information.'},{from:'t',to:'b',label:'CONFLICT',ret:true,note:'Nothing changes. Agent B reloads, sees the new priority, and makes a real decision.'}]}
```

## Your task

### 1. `triage` mutation in `createTriageRouter()`

The input is a strict Zod object, accepting exactly:

| Field | Rule |
| --- | --- |
| `ticketId` | 24 hexadecimal characters |
| `priority` | `low`, `normal` or `high` |
| `expectedVersion` | a non-negative integer |

Tenant isn't an input field, and it must be rejected if someone sends it.

### 2. Permission

Require `tickets:triage` with your existing policy, and convert a denial to a `TRPCError` with code `FORBIDDEN`.

### 3. Atomic update

Update the ticket matching `_id`, the context's tenant **and** `expectedVersion`: set the priority and increment the version, in one operation. Return `{ id, priority, version }`, with the values after the update.

### 4. When nothing matches

Throw a `TRPCError` with code `CONFLICT` and a generic message. A stale version and another tenant's ticket must look identical to the caller.

| Situation | Result |
| --- | --- |
| Valid, current version | `{ id, priority, version: v + 1 }` |
| Stale version | `CONFLICT` |
| A valid ID in another tenant | `CONFLICT`, same message |
| An ID that isn't 24 hex characters | `BAD_REQUEST` |
| A reader calling it | `FORBIDDEN` |
| Any other storage error | it escapes as it is |

Don't modify `ingest` or the context to make this pass. This step reuses both.

## Hints

### Getting the new values back
`updateOne` only tells you whether it matched. You need the updated document too. Which method gives you that, and which option picks "after"?

### What goes in the filter?
Count the facts that must be true at the moment of the write. There are three.

### Translating the denial
`requireAction` throws a plain `Error`. What does a caller see if it escapes the procedure unchanged? Remember "translate narrowly".
