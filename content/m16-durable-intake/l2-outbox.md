---
title: "The crash between saving and notifying"
minutes: 25
---

A library saves your reservation, then emails a confirmation. It's two lines of code, and you've written that shape a hundred times:

```ts
await reservation.save();
await sendConfirmation(reservation);
```

Now pull the plug between those lines. The reservation exists, and the customer hears nothing. So you swap the lines, and now a crash leaves a customer holding a confirmation for a reservation that was never saved.

There's no safe order, and this isn't a bug in your code. **A MongoDB write and a queue publish are two separate systems, and they can't commit together.** `await` makes the order clear. It doesn't tie them together. `Promise.all` only changes the timing of the same gap.

Try to find a safe order yourself. Pick a strategy, then crash the process in the middle:

```viz dual-write
{}
```

## Write down what you owe

The third strategy in that lab is the idea this module is named after, usually called the **outbox pattern**. Instead of doing the second thing, you *write down that you owe it*, in the same atomic write as the business change:

1. Save the ticket **and** a pending event in one atomic write.
2. A separate dispatcher reads pending events and tries to deliver them.
3. Only after delivery succeeds, mark the event delivered.

A crash can no longer lose anything, since the debt is saved with the ticket. If the dispatcher dies, the next one picks up the pending event.

You've traded the problem for a much nicer one. Say delivery succeeds and the dispatcher dies before it records that. The event is still pending, so it gets delivered **again**. This is called **at-least-once delivery**, and it means every consumer has to tolerate duplicates. Module 19 is all about that.

> [!IMPORTANT]
> Any delivery guarantee needs a choice between "might be lost" and "might repeat". We pick repeat, because a repeat can be detected and a loss can't.

## Where does the debt live?

"In the same atomic write" is the catch. MongoDB guarantees atomicity **per document**. So we have two choices:

| Where the event lives | Atomic with the ticket? | Needs |
| --- | --- | --- |
| Inside the ticket document | Yes, it's one document | nothing extra |
| A separate `outbox` collection | Only in a transaction | a replica set or sharded cluster |

MongoDB multi-document transactions don't run on a plain standalone server, which is what your lab has. So Relaydesk embeds one bounded event inside the ticket. That's a fair choice here, since a ticket has exactly one opening event. An array that keeps growing forever would be a bad idea: a document has a 16 MB limit, and you'd be rewriting that array constantly.

## Retries need a stable identity

Next problem: the client calls `ingest`, the response gets lost, and the client calls again. Are there two tickets now?

Only if your identity is generated on arrival. The *caller* has to supply a key that stays the same across retries: `sourceId`. Paired with the tenant, it can be a unique index. A random ID generated per attempt defeats the whole thing.

So what you need is "insert if it's missing, otherwise leave it alone". You don't want to write that as find-then-create, because you know how that race ends. MongoDB has an operator for this, `$setOnInsert`, and it's worth a proper look.

## `$setOnInsert`, the insert-only write

An upsert updates a matching document or inserts a new one. `$setOnInsert` applies **only when it inserts**. On a match it does nothing, which gives you "first write wins".

Here's a small case. A library records the first time a card visits each branch:

```ts
// @worked-example first-visit
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  branch: { type: String, required: true },
  cardId: { type: String, required: true },
  firstDesk: { type: String, required: true },
});
schema.index({ branch: 1, cardId: 1 }, { unique: true });
export const Visit = mongoose.models.Visit || mongoose.model('Visit', schema);

export async function recordVisit(branch: string, cardId: string, desk: string) {
  return Visit.findOneAndUpdate(
    { branch, cardId },
    { $setOnInsert: { firstDesk: desk } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean();
}

// recordVisit('north', 'c1', 'desk-a') -> firstDesk: 'desk-a'
// recordVisit('north', 'c1', 'desk-b') -> firstDesk: 'desk-a', unchanged
// recordVisit('south', 'c1', 'desk-b') -> a new row, firstDesk: 'desk-b'
```

Read those last three lines carefully, since they contain all of the behavior you need:

- The filter (`branch`, `cardId`) decides "is this the same thing?".
- The first caller's data wins, and repeats change nothing.
- A second branch can reuse the same `cardId`, because the index covers both fields.

With `$set` instead, the second call would overwrite `firstDesk` and history would be lost.

> [!WARNING] Upserts can still race
> Two simultaneous upserts can both see "no match" and both try to insert. The unique index stops the second, and it gets an `E11000` error. MongoDB often retries this for you, but you can't count on it. If you catch a duplicate-key error (`error.code === 11000`), the row you wanted now exists, so read it. Catch **only** that code: any other error is a real failure and has to escape.

```quiz
Q: A second request arrives with the same (tenant, sourceId) but a different subject. With $setOnInsert, what's stored?
- [x] The original subject, unchanged
- [ ] The new subject
- [ ] Both, in two documents
> The filter matches, so nothing in $setOnInsert applies. In this lab the first accepted payload wins. A stricter API might reject a mismatched payload instead. Either is fine, as long as the contract says which.
```

## Be honest about what this guarantees

An embedded event makes the *intent* durable. It doesn't make delivery instant, and a stopped dispatcher leaves work pending forever. Nothing here sends a real email exactly once either: a provider call needs its own idempotency key.

Be suspicious of the phrase "exactly once". Unless you can name the effect and the storage constraint that proves it, you don't have it. In Relaydesk you will be able to name both, and it'll happen in Module 19.

```quiz
Q: A ticket is saved, its event is delivered, then the dispatcher crashes before marking it delivered. What should recovery do?
- [ ] Delete the ticket
- [x] Deliver the same event again, and let the consumer make that safe
- [ ] Invent a new event ID to avoid a conflict
> Without the acknowledgement, delivery is unknown. A stable event ID lets the consumer recognize the repeat. That's at-least-once delivery with an idempotent effect.
```

## What's next

Relaydesk finally gets a database. You'll model a ticket with its embedded event and make intake safe under retries and races, using what you've just learned.
