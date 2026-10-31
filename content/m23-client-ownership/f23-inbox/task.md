---
title: 'Relaydesk: own the inbox interaction'
kind: forge
workspace: relaydesk
env: dom
summary: 'Build a real React/Apollo inbox with validated forms, triage, retries and honest failure states.'
focus: ['web/SupportInbox.tsx']
readonly: ['web/App.tsx', 'web/inbox-contract.ts', 'web/preview.tsx']
preview: 'web/preview.tsx'
---

This is the screen a support agent lives in, and the last piece of Relaydesk to become yours. It looks like a list and a form. What makes it hard is everything between them: a write that worked followed by a read that didn't, a version that went stale, a response from a tenant you've left.

Render it inside the supplied `ApolloProvider`, and run the preview as you go.

```viz-sequence
{title:'Accept, then refresh',actors:[{id:'f',label:'Form',color:'react'},{id:'a',label:'api.accept',color:'gql'},{id:'o',label:'changed()',color:'forge'},{id:'q',label:'Inbox query',color:'mongo'}],steps:[{from:'f',to:'a',label:'valid draft',note:'Trimmed, with contactId c1. An invalid draft never gets this far.'},{from:'a',to:'f',label:'accepted',ret:true,note:'The ticket exists now, and that can\'t be undone by anything below.'},{from:'f',to:'o',label:'notify first',note:'The parent hears about the write **before** any refresh is attempted.'},{from:'f',to:'q',label:'refetch',note:'This can fail by itself. If it does, the acceptance still stands.'}]}
```

## Your task

Implement `SupportInbox({ api, changed })` in `web/SupportInbox.tsx`.

### 1. The list

Read `TICKETS` with `useQuery<TicketsQuery>`.

| State | Show |
| --- | --- |
| Loading | a status |
| Failed | a readable error, in `role="alert"` |
| No tickets | text containing `No tickets` |
| Tickets | subject, contact name (or `Contact unavailable`), priority and version |

A `Refresh inbox` button must recover from a failed query.

### 2. The form

Labels are `Source key` and `Subject`, with an `Accept ticket` submit button. Source key starts as `web-1`. Trim both fields, and require each to be non-empty. Invalid fields show useful errors, without calling `api.accept`.

The lesson's React Hook Form and Zod approach is the intended one, and any correct design passes.

### 3. Accepting

Send `{ sourceId, subject, contactId: 'c1' }`. On success, call `changed()`, show a confirmation, and refetch the real query.

Keep the input, so that the same source key can be retried. Keep server errors visible, and allow a retry. If the write works and the refresh fails, `changed()` must still have been called.

### 4. Triage

Each ticket gets a `Raise priority` button. It calls `api.triage` with the ticket's ID, its **displayed** version and priority `high`, then refetches. A stale-version conflict must be visible and recoverable, and you can't optimistically bump a version.

### 5. Lifetime

Disable submitting, triage and refresh while an action is pending. A response from an obsolete `api` must not update this view or call its `changed`. The shell remounts on identity changes, and the component still has to release pending ownership cleanly.

Launching the whole project uses your real session and HTTP server, so try it there too. The next lesson is your first change with no brief to lean on.

## Hints

### Three kinds of state
Before you write any `useState`, list each piece of state and its owner from Lesson 1. Does anything from the server need to go in there?

### Order of facts
Say your accept handler out loud, one fact at a time. Where does a failure of the refetch go, so that it can't look like a failed accept?

### A failed query and old data
After a failed refetch, Apollo may hold both `error` and earlier `data`. What should a truthful screen show? Is a stale list still worth keeping?

### Stale work
`lifetime()` from the lesson answers "am I still the latest?". When should a new lifetime begin? What should an old one skip?
