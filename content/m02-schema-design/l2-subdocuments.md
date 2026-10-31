---
title: Subdocuments, arrays and nesting
minutes: 14
---

MongoDB lets a document contain objects and arrays of objects. Mongoose gives you two ways to describe them, and they behave differently enough that it's worth knowing which one you're looking at when you open a model file in a big codebase.

## Nested paths vs subdocuments

```compare
--- nested path (plain object in the schema)
const bookSchema = new Schema({
  title: String,
  author: {
    name: String,
    born: Number,
  },
});
--- subdocument (a schema inside a schema)
const authorSchema = new Schema({
  name: { type: String, required: true },
  born: Number,
});

const bookSchema = new Schema({
  title: String,
  author: authorSchema,
});
```

Both store the exact same shape in MongoDB: `{ title, author: { name, born } }`. The difference is in what Mongoose does with it:

| | Nested path | Single subdocument |
| --- | --- | --- |
| Is `author` its own Document? | no — just paths `author.name`, `author.born` | yes — has its own `validate`, middleware, methods |
| Gets an `_id`? | no | **yes, by default** (`{ _id: false }` to turn off) |
| Can `author` be `null`/missing as a whole? | always "present" (an empty object) | yes — can be `undefined`, or `required` |
| Reusable across models? | no | yes, the same `authorSchema` anywhere |

Rule of thumb: a few related fields that just group things (an `address` with street/city) → nested path is fine. A *thing* with its own rules, that you'll reuse or put in an array → subdocument schema.

## Arrays of subdocuments

This is where subdocuments shine. Reviews of a book:

```ts title="models/Book.ts" {1-8,12}
const reviewSchema = new Schema(
  {
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, maxlength: 2000 },
    by: { type: String, required: true },
  },
  { timestamps: true },
);

const bookSchema = new Schema({
  title: { type: String, required: true },
  reviews: [reviewSchema],
});
```

Here's what a saved book looks like, and how Mongoose sees it:

```viz-tree
{
  root: {
    label: 'Book document', color: 'mongo', id: 'book',
    children: [
      { label: '_id: ObjectId("66f…01")', color: 'neutral' },
      { label: 'title: "Kindred"', color: 'neutral' },
      { label: 'reviews  (DocumentArray)', color: 'mongo', id: 'arr', children: [
        { label: '[0] Review subdoc', color: 'mongo', id: 'r0', children: [
          { label: '_id: ObjectId("66f…a1")', color: 'neutral', id: 'r0id' },
          { label: 'rating: 5', color: 'neutral' },
          { label: 'by: "sam"', color: 'neutral' },
        ]},
        { label: '[1] Review subdoc', color: 'mongo', id: 'r1', children: [
          { label: '_id: ObjectId("66f…a2")', color: 'neutral' },
          { label: 'rating: 0', color: 'bad', id: 'bad' },
          { label: 'by: "kai"', color: 'neutral' },
        ]},
      ]},
    ],
  },
  steps: [
    { focus: ['arr'], caption: '`book.reviews` is a **DocumentArray**: an array subclass whose items are subdocuments, each cast and validated with `reviewSchema`.' },
    { focus: ['r0', 'r0id'], caption: 'Every subdocument gets its own `_id` by default — so you can find one later with `book.reviews.id(reviewId)`.' },
    { focus: ['r1', 'bad'], caption: 'Subdocuments are validated **with the parent**. Saving the book fails with a ValidationError whose path is `reviews.1.rating` — array index included.', reveal: { bad: '!min' } },
  ],
}
```

Working with them is just array manipulation on the parent, then saving the parent:

```ts
const book = await Book.findById(bookId);

book.reviews.push({ rating: 4, by: 'mo' });   // cast into a subdoc immediately
const r = book.reviews.id(reviewId);          // find by subdoc _id (or null)
r.text = 'Changed my mind';                   // edit in place
book.reviews.pull(otherReviewId);             // remove by _id

await book.save();                            // validates everything, then writes
```

> [!IMPORTANT]
> Subdocuments are **never saved on their own**. There's no `review.save()` that writes to the database — the review lives inside the book, so you save the book. If a change to a subdoc "doesn't stick", look for the missing `parent.save()`.

## Validating the array itself

Validators on the array path see the **whole array**:

```ts
reviews: {
  type: [reviewSchema],
  validate: {
    validator: (arr: unknown[]) => arr.length <= 100,
    message: 'A book can have at most 100 reviews',
  },
},
```

(The short form works too: `validate: [fn, 'message']`.)

Note what's different: element rules (rating 1–5) go **in the subdocument schema**; collection rules (at most 100, at least one, no duplicates) go **on the array path**.

## How big can an embedded array get?

A MongoDB document is capped at **16 MB**. More importantly, every read of the book loads all its reviews, and every write rewrites… well, enough of it to hurt. An array that grows without bound — every review ever, every page view, every comment on a popular issue — is a modeling smell.

That's the core question of Module 4 (embed or reference?), but the quick heuristic:

- **Embed** when the child is small, bounded, and you almost always read it with the parent: an issue's labels, an order's line items, a user's addresses.
- **Reference** (separate collection) when it's unbounded or has its own life: comments, reviews on a popular product, audit logs.

Taskforge will do both: labels are embedded in issues; comments get their own collection.

```quiz
Q: You want each label on an issue to have `name` and `color`, but no `_id` of its own. Which do you write?
- [ ] `labels: [{ name: String, color: String }], _id: false`
- [x] `labels: [new Schema({ name: String, color: String }, { _id: false })]`
- [ ] `labels: { type: [labelSchema], unique: true }`
> `_id: false` belongs on the schema whose documents shouldn't get an `_id`: here the label's schema, as the second argument of `new Schema()`. The first option puts it on the issue's schema instead, so the issue loses its `_id` and the labels keep theirs.
```

```quiz
Q: Saving a book fails with a ValidationError on path `reviews.2.rating`. What does that tell you?
- [ ] The third book in the collection is invalid
- [x] The third review in this book's `reviews` array has an invalid `rating`
- [ ] The rating field is missing from the schema
> Error paths include array indexes, so you can point a user at exactly which item in a list is wrong.
```
