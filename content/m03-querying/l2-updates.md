---
title: "Updates: atomic operators and the validator traps"
minutes: 18
---

Reading data is forgiving: a bad query returns wrong results, you notice, you fix it. Writing data is not: a bad update corrupts records quietly, and you find out weeks later. So this lesson is a little more paranoid than the last one, on purpose.

## Two ways to change a document

```compare
--- 1. load → modify → save
const book = await Book.findById(id);
if (!book) throw new Error('not found');
book.copiesLeft -= 1;
await book.save();
// ✔ validators + document middleware run
// ✔ easy to read, can run any JS logic
// ✘ two round trips, and a race window
--- 2. update query
await Book.updateOne(
  { _id: id },
  { $inc: { copiesLeft: -1 } },
);
// ✔ one round trip, atomic in MongoDB
// ✘ document middleware does NOT run
// ✘ validators do NOT run (by default)
```

Neither is "the right one". Let's see where each one breaks.

### The lost update

A library has 1 copy of a book left. Two people borrow it at the same moment, using load-modify-save:

```viz-sequence
{
  actors: [
    { id: 'a', label: 'request A', color: 'neutral' },
    { id: 'db', label: 'MongoDB', sub: 'copiesLeft: 1', color: 'mongo' },
    { id: 'b', label: 'request B', color: 'neutral' },
  ],
  steps: [
    { from: 'a', to: 'db', label: 'findById', note: 'A loads the book.' },
    { from: 'db', to: 'a', label: 'copiesLeft: 1', ret: true },
    { from: 'b', to: 'db', label: 'findById', note: 'B loads the book a few ms later — the database still says 1.' },
    { from: 'db', to: 'b', label: 'copiesLeft: 1', ret: true },
    { from: 'a', to: 'a', label: '1 - 1 = 0', note: 'Both compute in JavaScript, from the value they *read*…' },
    { from: 'b', to: 'b', label: '1 - 1 = 0' },
    { from: 'a', to: 'db', label: 'save → copiesLeft: 0', note: 'A writes 0.' },
    { from: 'b', to: 'db', label: 'save → copiesLeft: 0', note: '**B also writes 0.** Two people borrowed one book, and the count says 0, not -1. One borrow was silently lost. No error anywhere.' },
  ],
}
```

The read and the write are separate operations, and the world changed in between. Now the atomic version:

```viz-sequence
{
  actors: [
    { id: 'a', label: 'request A', color: 'neutral' },
    { id: 'db', label: 'MongoDB', sub: 'copiesLeft: 1', color: 'mongo' },
    { id: 'b', label: 'request B', color: 'neutral' },
  ],
  steps: [
    { from: 'a', to: 'db', label: 'updateOne({ _id, copiesLeft: { $gte: 1 } }, { $inc: -1 })', note: 'A sends the *condition* and the *change* together. MongoDB checks and writes in one step, per document, atomically.' },
    { from: 'db', to: 'a', label: 'modifiedCount: 1', ret: true, note: 'Matched, decremented. copiesLeft is now 0.' },
    { from: 'b', to: 'db', label: 'updateOne({ _id, copiesLeft: { $gte: 1 } }, { $inc: -1 })', note: 'B sends the same update.' },
    { from: 'db', to: 'b', label: 'modifiedCount: 0', ret: true, note: '**No match** — copiesLeft is 0, so the condition fails and nothing is written. B knows it didn\'t get the book and can tell the user.' },
  ],
}
```

This is the **conditional update** pattern: put the precondition in the filter, the change in the update, and check whether anything matched. You'll use it for stock, seats, quotas, "only the owner can edit", "only move TODO → IN_PROGRESS"… It's one of the most useful things in this whole module.

## Update operators

| Operator | Does | Example |
| --- | --- | --- |
| `$set` | set fields | `{ $set: { title: 'Dune', 'author.born': 1920 } }` |
| `$unset` | remove fields | `{ $unset: { isbn: '' } }` |
| `$inc` | add (or subtract) a number | `{ $inc: { copiesLeft: -1, timesBorrowed: 1 } }` |
| `$push` | append to array | `{ $push: { reviews: { by: 'sam', rating: 5 } } }` |
| `$addToSet` | append if not already present | `{ $addToSet: { tags: 'classic' } }` |
| `$pull` | remove matching elements | `{ $pull: { tags: 'draft' } }` or `{ $pull: { reviews: { by: 'sam' } } }` |
| `$each` | many at once (with `$push`/`$addToSet`) | `{ $addToSet: { tags: { $each: ['a', 'b'] } } }` |

A bare object in Mongoose — `updateOne(filter, { title: 'Dune' })` — is treated as `$set`. Convenient; but write `$set` explicitly in shared code so nobody wonders.

Mongoose still **casts** update values through the schema: setters like `lowercase` apply to `$set` and `$addToSet` values, and `{ $set: { year: 'abc' } }` throws a CastError.

`$addToSet` compares whole values. For an array of subdocuments, "no two labels with the same **name**" isn't something `$addToSet` can express (it would compare `{name, color}` as a whole). Use a conditional update instead:

```ts
// add the tag only if no tag with that name exists yet
await Book.updateOne(
  { _id: id, 'tags.name': { $ne: tag.name } },
  { $push: { tags: tag } },
);
```

## Getting the document back

`updateOne`/`updateMany` return counts: `{ matchedCount, modifiedCount, ... }`. When you need the document, use `findOneAndUpdate` / `findByIdAndUpdate` — and mind the default:

> [!WARNING] It returns the document from *before* the update
> `await Book.findByIdAndUpdate(id, { $set: { title: 'New' } })` resolves to the **old** document. Pass `{ returnDocument: 'after' }` to get the updated one. You'll see `{ new: true }` in older code — same thing, **deprecated in Mongoose 9**.

It resolves to `null` when nothing matched — which, with a conditional filter, means "not found *or* condition failed". If you need to tell those apart, you'll need a second lookup.

## The validator traps

Here's the part that bites experienced developers.

### Trap 1: validators are off for updates

```ts
// schema: rating: { type: Number, min: 1, max: 5 }
await Book.updateOne({ _id: id }, { $set: { rating: 99 } }); // ✔ succeeds. rating is now 99.
```

Update queries **skip validation** unless you ask for it:

```ts
await Book.updateOne({ _id: id }, { $set: { rating: 99 } }, { runValidators: true }); // ✘ ValidationError
```

Many teams set it globally once — `mongoose.set('runValidators', true)` — precisely because forgetting it is so common.

### Trap 2: even with `runValidators`, `$inc` isn't validated

Update validators only run for `$set`, `$unset`, `$push`, `$addToSet`, `$pull` and `$pullAll`. Not `$inc`:

```ts
// schema: copiesLeft: { type: Number, min: 0 }
await Book.updateOne({ _id: id }, { $inc: { copiesLeft: -5 } }, { runValidators: true });
// ✔ succeeds. copiesLeft is now -4.
```

(Yes, really — this was checked against the Mongoose version in this sandbox.) The fix is the conditional update from earlier: `{ copiesLeft: { $gte: 5 } }` in the filter. The *filter* is your guard for arithmetic.

### Trap 3: `this` isn't the document

In update validators, `this` is the **Query**, not a document. A cross-field validator like "endsAt must be after `this.startsAt`" compares against `undefined` and fails even on valid data — or worse, passes on invalid data, depending on how it's written. For rules that involve several fields, load the document and `save()`, or check explicitly in your service code.

```viz-flow
{
  title: 'Which write path, when?',
  colWidth: 250,
  rowHeight: 80,
  nodes: [
    { id: 'q', label: 'Need JS logic, hooks, or cross-field rules?', col: 0, row: 0.5, color: 'neutral', w: 230 },
    { id: 'save', label: 'load → modify → save()', sub: 'validators + middleware run', col: 1, row: 0, color: 'mongo', w: 220 },
    { id: 'upd', label: 'update query', sub: 'atomic · condition in filter', col: 1, row: 1, color: 'mongo', w: 220 },
  ],
  edges: [
    { from: 'q', to: 'save', label: 'yes' },
    { from: 'q', to: 'upd', label: 'no / concurrent' },
  ],
}
```

## Upserts and deletes, briefly

```ts
// update if exists, insert if not
await Counter.updateOne({ _id: 'books' }, { $inc: { seq: 1 } }, { upsert: true });

await Book.deleteOne({ _id: id });           // { deletedCount: 0 | 1 }
await Book.deleteMany({ tags: 'draft' });
const removed = await Book.findByIdAndDelete(id); // the deleted doc, or null
```

You'll use an upsert with `$inc` in Module 5 to generate issue numbers (`TF-1`, `TF-2`…) without races.

```quiz
Q: `copiesLeft` has `min: 0`. Which update can never take it below zero, even with many concurrent requests?
- [ ] `updateOne({ _id }, { $inc: { copiesLeft: -1 } }, { runValidators: true })`
- [x] `updateOne({ _id, copiesLeft: { $gte: 1 } }, { $inc: { copiesLeft: -1 } })`
- [ ] Load the doc, check `copiesLeft > 0`, decrement, `save()`
> `runValidators` doesn't check `$inc`, and load-check-save has a race window. Putting the precondition in the filter makes the check and the write a single atomic operation.
```

```quiz
Q: `const doc = await Issue.findByIdAndUpdate(id, { $set: { status: 'DONE' } })` — what is `doc.status`?
- [x] Whatever it was before the update
- [ ] `'DONE'`
- [ ] `undefined`
> findOneAndUpdate-style methods return the original document by default. Pass `{ returnDocument: 'after' }`.
```
