---
title: "Two requests pass the same if statement"
minutes: 22
---

Back in Module 3 you protected inventory with a conditional update, and I told you to stay a little paranoid. Now we go looking for trouble on purpose.

Here's the claim of this lesson: **an `if` statement can't protect anything that lives in a database.** By the time your `if` runs, the data it looked at may already be out of date.

## A check is not a reservation

A concert site reads seat A12 and sees `available`. Another request does the same a moment later. Each one runs its `if`, each one writes `reserved`, and each one tells its customer "you're in".

```viz-sequence
{title:'The gap between reading and writing',actors:[{id:'a',label:'Request A',color:'gql'},{id:'db',label:'Seat A12',color:'mongo'},{id:'b',label:'Request B',color:'react'}],steps:[{from:'a',to:'db',label:'read: available',note:'A is about to reserve. Nothing has been written yet.'},{from:'b',to:'db',label:'read: available',note:'Both checks are true. **Both were correct at the moment they ran.**'},{from:'a',to:'db',label:'write: reserved',note:'A thinks it won.'},{from:'b',to:'db',label:'write: reserved',note:'The final value says reserved, which looks completely fine. Nothing records that **two** people were promised this seat.'}]}
```

That last note is the nasty part. The database ends up looking healthy, and the only evidence is two confirmation emails.

"But JavaScript is single-threaded!" Sure, in one process, and we saw in the last module how far that gets you. Each `await` is a gap. And real deployments run several processes of each service anyway, so a lock in one process's memory can't see the others.

## Move the condition into the write

The fix is the same trick as Module 3: stop asking and start *attempting*. Make the precondition part of the write itself, so MongoDB checks it and makes the change as one step.

Here's that move on a simple case, a library's single copy of a book:

```compare
--- ✘ Check, then write
const copy = await Copy.findById(id);
if (copy.status !== 'shelf') return false;
copy.status = 'loaned';
await copy.save();
return true;
// ✘ two callers can both pass the if
--- ✔ The check IS the write
const result = await Copy.updateOne(
  { _id: id, status: 'shelf' },   // only if it's still on the shelf
  { $set: { status: 'loaned' } },
);
return result.matchedCount === 1;
// ✔ MongoDB matches and updates a document as one step
// ✔ the loser gets matchedCount 0, not an error
```

And here it is running against a real database. Eight people grab the same copy at once:

```ts
// @worked-example guarded-copy
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  status: { type: String, enum: ['shelf', 'loaned'], default: 'shelf' },
});
export const Copy = mongoose.models.Copy || mongoose.model('Copy', schema);

export async function borrow(id: string): Promise<boolean> {
  const result = await Copy.updateOne(
    { _id: id, status: 'shelf' },
    { $set: { status: 'loaned' } },
  );
  return result.matchedCount === 1;
}

export async function rush(id: string) {
  const outcomes = await Promise.all(Array.from({ length: 8 }, () => borrow(id)));
  return outcomes.filter(Boolean).length; // 1, every time
}
```

Exactly one winner. Notice what the loser got: `matchedCount: 0`. That isn't a crash or an outage, it's an answer: "someone beat you to it". So the function returns `false`, it doesn't throw.

> [!WARNING] Reading `matchedCount` is part of the fix
> If you run a guarded update and ignore the result, you've closed the race and then told the loser they won. The guard only helps if you look at the answer.

## Versions: catching stale intent

Status works when there are two states. What about a form? A dispatcher opens a booking, reads it for two minutes, and clicks Save. Meanwhile a colleague changed the same booking. Should the dispatcher's save go through?

Give each document a number that goes up on every write. The dispatcher's request carries the number they saw:

```ts
await Booking.updateOne(
  { _id: id, version: 4 },                  // what I saw
  { $set: { driver: 'Sam' }, $inc: { version: 1 } }, // what I want
);
```

If someone else has already moved it to version 5, this matches nothing, and you know the dispatcher was working from old information. This pattern is called **optimistic concurrency**: try it and handle the rare clash, without locking anything.

Two things have to be true together. The version check goes in the filter, and the increment goes in the same update. Read the version first and then update by ID alone, and the original race is back. And it protects this update only: an email you send "while you're at it" isn't covered.

```quiz
Q: Both callers read version 4. Each updates with filter {id, version: 4} and increments the version. How many can win?
- [x] One
- [ ] Two, because both already passed their read checks
- [ ] Zero, because version fields are locked
> The first write moves the stored version to 5, so the second write's filter matches nothing. What they read earlier doesn't matter. Only the write's own filter counts.
```

## Some rules belong in the database

Some promises can't be made by filtering one document. "Only one ticket per external ID" is a rule about a document that doesn't exist yet:

```ts
// Both callers can pass this check, then both insert.
if (!(await Ticket.exists({ sourceId }))) await Ticket.create({ sourceId });
```

There's nothing to put a filter on. What you need is a **unique index**, because MongoDB enforces that on every write, no matter how many processes you run:

```ts
ticketSchema.index({ tenant: 1, sourceId: 1 }, { unique: true });
```

The loser now gets an error with `code: 11000`, MongoDB's duplicate key error. Don't confuse it with validation. A Mongoose `ValidationError` means your schema refused the document before it left the process. An `E11000` comes from the database, and it's often **expected** in a race, so it can be handled. We'll use that in the next lesson.

| Failure | Who raised it | What it usually means |
| --- | --- | --- |
| `ValidationError` | Mongoose | bad input, tell the caller |
| `code: 11000` | MongoDB index | someone got there first, read theirs |
| `matchedCount: 0` | no error at all | your precondition no longer holds |

```quiz
Q: A guarded updateOne returns matchedCount 0. What's the right reaction?
- [ ] Throw an internal server error
- [ ] Retry the same update in a loop until it matches
- [x] Treat it as a normal conflict and report it
> Nothing is broken. Someone else changed the state first, so the honest answer is "you didn't get it". Whether to reload and try again is a decision for the user, not a loop.
```

## What's next

The drill uses real MongoDB and real concurrent promises, and you'll bring versions and status together. Predict how many winners there should be before you Submit. A test that calls your function once proves nothing here, and the tests know that.
