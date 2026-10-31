---
title: "Define the effect you can make idempotent"
minutes: 24
---

A library receives the same book-return event twice. That's going to happen: you learned in Module 16 that at-least-once delivery repeats on purpose.

If each delivery runs `$inc: { returnedCount: 1 }`, the count is wrong forever. If each delivery inserts a return receipt uniquely identified by `(library, eventId)`, a repeat changes nothing.

An operation is **idempotent** if doing it twice has the same effect as doing it once. The title has a key word: you don't make a *handler* idempotent, you pick an **effect** that can be, and say exactly what it is.

## The marker trap

The obvious approach is a "processed" flag. Both orders fail, and it's worth seeing why.

```compare
--- ✘ Mark, then act
await Processed.create({ eventId });
await sendEmail(event);
// ✘ crash between them: the marker says done
// ✘ and the email never went out
--- ✘ Act, then mark
await sendEmail(event);
await Processed.create({ eventId });
// ✘ crash between them: the retry sends a second email
// ✔ at least nothing's lost
--- ✔ The record IS the effect
await Receipt.create({ library, eventId });
// ✔ the unique index makes this one atomic fact
// ✔ nothing can happen in between, there's no "between"
```

This is the same reasoning as the outbox. Two writes to two places can't be made atomic, so stop having two writes. When the thing you wanted to happen is a database row, make that row carry the identity, and let a unique index do the job.

Here's the full shape, with a concurrent race to prove it. Note what it catches, and what it refuses to catch:

```ts
// @worked-example return-receipt
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  library: { type: String, required: true },
  eventId: { type: String, required: true },
});
schema.index({ library: 1, eventId: 1 }, { unique: true });
export const Receipt = mongoose.models.Receipt || mongoose.model('Receipt', schema);

export async function recordReturn(library: string, eventId: string) {
  try {
    await Receipt.create({ library, eventId });
    return 'recorded';
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return 'already-recorded';
    throw error;
  }
}

export const delivered = () =>
  Promise.all(Array.from({ length: 5 }, () => recordReturn('north', 'e-1')));
```

`delivered()` gives one `'recorded'` and four `'already-recorded'`, in some order, with exactly one row. Each caller gets a clear answer without having to check first.

> [!WARNING] Catch one code, not everything
> `catch { return 'already-recorded' }` is shorter, and it's a disaster. Now a database outage reports success, and BullMQ marks the job complete. The work is gone. A network error, a malformed event or a permissions failure must reject.

## Now find the crash

Time to attack this. In the lab, walk an event through delivery, then crash at the worst moments you can find. Start with the one right after the effect commits but before the acknowledgement:

```viz delivery-lab
{}
```

You should find that the design survives, and that the receipt is why. A crash after the effect means a redelivery, and that's only a duplicate attempt, which the receipt absorbs.

## Be honest about the boundary

This gives you exactly one receipt per event. That's the claim, and it doesn't stretch further:

| Effect | How to get idempotency |
| --- | --- |
| A row in your database | Unique index, as above |
| A counter | Store the receipt and increment in one document, or derive the count from receipts |
| A remote payment or email | Send a stable idempotency key, **if the provider supports one** |
| A remote API with no key | You can't. Reconcile or compensate, and say so |

The counter row deserves a closer look, since it's the `$inc` this lesson opened with. The trick is that the update's filter refuses any event the document has already seen, and a single-document update is atomic:

```ts
// @worked-example counted-once
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: String,
  returnedCount: { type: Number, default: 0 },
  seenEvents: { type: [String], default: [] },
});
export const Shelf = mongoose.models.Shelf || mongoose.model('Shelf', schema);

export async function countReturn(shelf: string, eventId: string) {
  const { modifiedCount } = await Shelf.updateOne(
    { _id: shelf, seenEvents: { $ne: eventId } },
    { $inc: { returnedCount: 1 }, $push: { seenEvents: eventId } },
  );
  return modifiedCount === 1 ? 'counted' : 'already-counted';
}
```

A repeat matches nothing, so it changes nothing. The cost is an array that grows with every event, and that's fine for a small document with few events. A busy counter should keep receipts in their own collection and derive the number from those.

Remember the word from Module 16: "exactly once" means nothing until you name the effect and the constraint.

## Stable IDs and the tenant

Two details that decide whether this works in production:

**The event ID must be stable.** It's generated once when the event is created, and stays put across retries. If a worker makes a fresh ID per attempt, the index sees a new row every time, and you've built a very elaborate way to insert duplicates.

**The tenant belongs in the unique index.** Local IDs can repeat across organizations, as you saw with `sourceId`. With an index on `eventId` alone, South's event could be rejected as a duplicate of North's. That'd be a silent cross-tenant failure, and a nasty one to find.

Validate the envelope before touching storage, too. A malformed event is a bug you want to see, and not a row you want to keep.

```quiz
Q: You insert a processed marker, then call an email provider. The process crashes before that call. What went wrong?
- [x] The marker claims an effect happened before it did
- [ ] The marker needs a longer random ID
- [ ] The queue should never retry
> The marker and the effect are two separate commits. A saved marker isn't evidence that an email was sent.
```

```quiz
Q: Which is a genuine duplicate that can safely be reported as already processed?
- [ ] Any error raised while saving the receipt
- [ ] A timeout from MongoDB
- [x] An E11000 on the (tenant, eventId) unique index
> Only the duplicate-key error proves that the receipt exists. Everything else means you don't know, and that has to stay visible.
```

## What's next

First, a bug hunt: an event vanishes after a delivery failure, because something happens in the wrong order. Then the forge step makes duplicates safe at the activity boundary and sets up a bounded BullMQ retry policy.

When your tests pass, say exactly what they prove: one activity receipt per tenant and event, under concurrent duplicate calls. They don't prove that every external effect happens exactly once.
