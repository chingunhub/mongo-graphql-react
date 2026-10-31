---
title: "Bug hunt: whoever came last"
kind: bughunt
db: true
summary: A logged-out visitor sees someone else's expenses. Four auth bugs, all of them quiet until they aren't.
focus: [context.ts, resolvers.ts, errors.ts, playground.ts]
readonly: [models/User.ts, models/Expense.ts, schema.ts, server.ts]
needs: [m08/l1-context-auth]
---

This one came from support, and the tone of the message tells you everything:

> **TICKET-6024 — "I can see Sam's expenses"** (priority: critical, security)
>
> 1. Someone opened the app **logged out** on a shared laptop and saw another person's expenses. It's always whoever used the app just before them.
> 2. Unrelated, maybe: people get "You cannot change this expense" when editing **their own** expenses. Everyone, every time.
> 3. Kai says an expense vanished, and the audit log says Sam deleted it. Sam didn't own it. How is that possible?
> 4. A customer sent a screenshot of a red banner saying `Cast to ObjectId failed for value "abc"...`. Someone swears they added error masking to `errors.ts` last quarter.

All four are in about forty lines of code, and the API looks healthy from the outside. Every request returns a nice 200.

The playground acts out each symptom by building a fresh context per simulated request, which is exactly what Apollo Server does. Run it before you read the code too closely.

## Your task

Make these rules true:

1. A request with no token, or a token nobody owns, is **anonymous**, whatever came before it.
2. An owner can update their own expense. Anyone else gets `FORBIDDEN` and the expense doesn't change.
3. An owner can delete their own expense. Anyone else gets `FORBIDDEN` and the expense stays.
4. Unexpected errors reach the client as `Something went wrong`, with code `INTERNAL_SERVER_ERROR`. Errors you threw on purpose keep their own message and code.

Fix what's broken and leave the structure alone.

## Hints

### Symptom 1

Forget resolvers for a minute and read `context.ts` as if two people were using it. How long does a value at the top level of a module live?

### Symptom 2

The check isn't throwing by accident. It's comparing two things that can never be equal, even when they look identical when printed. What kind of value is `expense.owner`, and what does `!==` compare for those?

### Symptoms 3 and 4

For 3, put two mutations side by side and spot what one does that the other doesn't. For 4, log `formatted.extensions?.code` in `formatError`, then trigger the banner. Is it the value the code is looking for?

### All four

`currentUser` belongs inside `buildContext`, as a local. Compare owners with `expense.owner.equals(user._id)`. Run the same ownership check in `deleteExpense`. And Apollo's code for unexpected errors is `INTERNAL_SERVER_ERROR`, not `INTERNAL_ERROR`.
