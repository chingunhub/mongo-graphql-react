---
title: "Bug hunt: the page that went blank"
kind: bughunt
db: true
summary: One deleted venue takes down a whole page, and three quieter resolver bugs are hiding behind it.
focus: [graphql/resolvers.ts, graphql/schema.ts, playground.ts]
readonly: [models/Event.ts, models/Venue.ts, server.ts]
needs: [m07/l1-resolver-anatomy, m06/l3-execution]
---

You've inherited the API behind a small events site. Nobody who wrote it is around, and this landed on Monday morning:

> **TICKET-5871 — "Events page is blank"** (priority: urgent)
>
> 1. Ops deleted a venue that closed down on Friday. Since then the **whole events page is empty**. Not one event, just nothing. The response says `"data": null`.
> 2. Organisers rename an event and the confirmation still shows the **old name**. Refresh, and the new name is there.
> 3. Dates on the page look like `1774224000000`.
> 4. Opening `/events/oops` shows "Something went wrong" instead of our normal "event not found" screen.

Run the playground first. It reproduces all four, and the first one is worth staring at: a single missing venue, on a single event, erased everyone else's events too. That's not a coincidence of this codebase. It's a rule of how GraphQL executes, and you've met it before.

## Your task

Fix the four symptoms with the smallest correct changes in `graphql/schema.ts` and `graphql/resolvers.ts`:

1. Every event stays on the list when its venue is gone. That event reports `venue: null`, with no error. Don't invent a placeholder venue, and don't drop the event.
2. `renameEvent` returns the event with its new title.
3. `startsAt` is an ISO string, like `2026-03-23T09:00:00.000Z`.
4. `event(id: ...)` with a malformed id returns `null`, the same as an id that doesn't exist. No error.

Don't touch the models.

## Hints

### Where to look for symptom 1

Read the error in the playground output, then find the `!` it's complaining about. What does GraphQL do when a non-null field resolves to `null`, and how far up does that travel?

### Symptoms 2 and 3

Both are Mongoose handing you something a little different from what the resolver assumes. For 2: which version of the document does `findByIdAndUpdate` return by default? For 3: a `Date` that reaches a `String` scalar gets turned into a string by `graphql`, just not the one you'd like. You can control this per field with a resolver on `Event`.

### Symptom 4

`findById('oops')` doesn't return `null`. It throws while casting the id. Mongoose can tell you whether a string could be an ObjectId before you ever run the query.

### All four

`venue: Venue` in the schema, `{ returnDocument: 'after' }` on the update, an `Event.startsAt` resolver calling `.toISOString()`, and `mongoose.isValidObjectId(id)` as a guard in `Query.event`.
