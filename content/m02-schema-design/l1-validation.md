---
title: "Validation: rules, errors, and the thing that isn't a validator"
minutes: 16
---

Validation is your data layer saying *no* before bad data gets in. It's also the first place your API's error messages come from — when a user submits a form with a two-letter title, the message they see started life as a Mongoose validator. So we'll look at both sides: writing rules, and reading the errors they produce.

## Built-in validators

Every schema type has a few built in. You've met `required` and `enum`. The full everyday set:

| Validator | Works on | Example |
| --- | --- | --- |
| `required` | anything | `title: { type: String, required: true }` |
| `min` / `max` | Number, Date | `rating: { type: Number, min: 1, max: 5 }` |
| `minlength` / `maxlength` | String | `title: { type: String, minlength: 2, maxlength: 200 }` |
| `match` | String | `isbn: { type: String, match: /^\d{13}$/ }` |
| `enum` | String, Number | `format: { type: String, enum: ['HARDCOVER', 'PAPERBACK', 'EBOOK'] }` |

Each one accepts a **custom message**, either as a `[value, message]` pair or an object:

```ts title="models/Book.ts"
const bookSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Every book needs a title'],
    maxlength: [200, 'Title is too long ({VALUE})'],
  },
  rating: { type: Number, min: [1, 'Rating starts at 1'], max: 5 },
  format: {
    type: String,
    enum: { values: ['HARDCOVER', 'PAPERBACK', 'EBOOK'], message: '{VALUE} is not a format we sell' },
  },
});
```

`{VALUE}` and `{PATH}` get filled in. Write messages a *user* could act on — in Part II these flow straight into API responses.

> [!WARNING]
> `required: true` on a String rejects the **empty string** `''` too. On an array, `required` does nothing useful (arrays default to `[]`, which counts as present) — check `length` with a custom validator instead.

> [!BRIDGE]
> In PostgreSQL, `NOT NULL` and `CHECK (rating BETWEEN 1 AND 5)` live in the table, and the database enforces them no matter who writes. Mongoose validators look like the same idea, but they live in your Node process. Unless you set up validation on the collection yourself, MongoDB stores whatever it's handed, so a script that skips Mongoose skips your rules too.

## Custom validators

When the built-ins aren't enough, write a function. Return `true` for valid, `false` for invalid:

```ts
const bookSchema = new Schema({
  isbn: {
    type: String,
    validate: {
      validator: (v: string) => isValidIsbn13(v), // checksum, not just digits
      message: (props) => `${props.value} is not a valid ISBN-13`,
    },
  },
});
```

The validator can be `async` (return a promise) — say, to call another service. Use that sparingly: it runs on every save.

There's one more thing a custom validator can do that the built-ins can't: **look at other fields**. Inside a regular `function` (not an arrow function!), `this` is the document being validated. Hold that thought — you'll need it in the drill.

## When validation runs

```viz-flow
{
  colWidth: 190,
  nodes: [
    { id: 'save', label: 'doc.save()', sub: 'Model.create()', col: 0, row: 0, color: 'mongo' },
    { id: 'val', label: 'doc.validate()', col: 0, row: 1, color: 'mongo' },
    { id: 'upd', label: 'updateOne()', sub: 'findOneAndUpdate()…', col: 0, row: 2, color: 'bad' },
    { id: 'run', label: 'validators run', col: 2, row: 0.5, color: 'ok' },
    { id: 'skip', label: 'validators SKIPPED', sub: 'unless runValidators: true', col: 2, row: 2, color: 'bad', w: 180 },
  ],
  edges: [
    { from: 'save', to: 'run' },
    { from: 'val', to: 'run' },
    { from: 'upd', to: 'skip' },
  ],
}
```

Validation runs on `save()` (and therefore `create()`), and when you call `validate()` yourself. **It does not run on update queries** by default — `updateOne({ ... }, { rating: 99 })` happily writes 99. That's a big enough trap that Module 3 has a whole section on it. For now: if you're writing through documents, you're protected.

You can also validate *without saving* — useful for checking a form before doing anything expensive:

```ts
const book = new Book({ title: '', rating: 9 });
try {
  await book.validate(); // runs every validator, throws a ValidationError — nothing is saved
} catch (err) {
  // inspect it (see below)
}
```

> [!NOTE]
> Older code and tutorials use `doc.validateSync()`. It still works but is **deprecated in Mongoose 9** (and skips async validators). Prefer `await doc.validate()`. Noticing deprecated APIs is a big-codebase skill: you'll often inherit code written against an older major version.

## Reading a ValidationError

This is the part people skip, and then they write `catch (e) { res.send(e.message) }` and users see ``Book validation failed: title: Every book needs a title, rating: Path `rating` (9) is more than maximum allowed value (5).`` in a toast. Let's look inside instead.

Mongoose doesn't stop at the first problem — it collects **every** failing path:

```viz-tree
{
  title: 'await Book.create({ title: "", rating: 9, year: "soon" })  →  throws',
  root: {
    label: 'err  (ValidationError)', color: 'bad', id: 'err',
    children: [
      { label: 'name: "ValidationError"', color: 'neutral' },
      { label: 'message: "Book validation failed: title: …, rating: …"', color: 'neutral' },
      { label: 'errors', color: 'bad', id: 'errors', children: [
        { label: 'title', id: 'title', color: 'bad', children: [
          { label: 'kind: "required"', color: 'neutral' },
          { label: 'message: "Every book needs a title"', color: 'neutral', id: 'tmsg' },
        ]},
        { label: 'rating', id: 'rating', color: 'bad', children: [
          { label: 'kind: "max"', color: 'neutral' },
          { label: 'value: 9', color: 'neutral' },
        ]},
        { label: 'year', id: 'year', color: 'bad', children: [
          { label: 'name: "CastError"', color: 'neutral', id: 'cast' },
          { label: 'kind: "Number"', color: 'neutral' },
        ]},
      ]},
    ],
  },
  steps: [
    { focus: ['err'], caption: 'One error object for the whole document. `err.name === "ValidationError"` is how you recognize it (`err instanceof mongoose.Error.ValidationError` works too).' },
    { focus: ['errors'], caption: '`err.errors` is an object keyed by **path**. One entry per failing field — all of them, not just the first.' },
    { focus: ['title', 'tmsg'], caption: 'Each entry has `kind` (which rule failed), `path`, `value` and a human `message` — your custom one if you wrote one.' },
    { focus: ['year', 'cast'], caption: 'Casting failures land here too, as a `CastError` with `kind` set to the target type. `"soon"` could not become a Number.' },
  ],
}
```

Turning that into something an API can return is a few lines:

```ts
function fieldErrors(err: mongoose.Error.ValidationError) {
  return Object.fromEntries(Object.entries(err.errors).map(([path, e]) => [path, e.message]));
}
// { title: 'Every book needs a title', rating: 'Path `rating` (9) is more than…', year: 'Cast to Number failed…' }
```

You'll write exactly this kind of mapping in Module 8, where it becomes a GraphQL error with field details.

## `unique` is not a validator

This is the single most misunderstood option in Mongoose, so let's be precise.

```ts
email: { type: String, unique: true }
```

This does **not** check anything when you save. It tells Mongoose to create a **unique index** in MongoDB. The *database* then refuses any insert or update that would create a duplicate, and you get a different kind of error entirely:

```compare
--- a ValidationError (Mongoose)
{
  name: 'ValidationError',
  errors: { title: { kind: 'required', … } }
}
// thrown before anything is sent to MongoDB
--- a duplicate key error (MongoDB)
{
  name: 'MongoServerError',
  code: 11000,
  keyValue: { email: 'ada@example.com' },
  message: 'E11000 duplicate key error collection: app.users index: email_1 dup key: …'
}
// thrown BY the database, during the insert
```

Why not just check "does this email exist?" before inserting? Because of this:

```viz-sequence
{
  title: 'Two sign-ups with the same email, 3ms apart',
  actors: [
    { id: 'a', label: 'request A', color: 'neutral' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
    { id: 'b', label: 'request B', color: 'neutral' },
  ],
  steps: [
    { from: 'a', to: 'db', label: 'findOne({ email })', note: 'Request A checks first: is ada@example.com taken?' },
    { from: 'b', to: 'db', label: 'findOne({ email })', note: 'Request B checks at almost the same moment.' },
    { from: 'db', to: 'a', label: 'null', ret: true, note: 'Not taken — A thinks it\'s safe.' },
    { from: 'db', to: 'b', label: 'null', ret: true, note: 'Not taken — B *also* thinks it\'s safe.' },
    { from: 'a', to: 'db', label: 'insert', note: 'A inserts.' },
    { from: 'b', to: 'db', label: 'insert', note: 'B inserts. **Without a unique index, you now have two Adas.** With one, this insert fails with E11000 — the database is the only place that sees both writes in order.' },
  ],
}
```

A check-then-insert has a gap between the check and the insert. A unique index has no gap. (A friendly "email already taken" pre-check is still nice for UX — just never rely on it.)

Two practical consequences:

1. **The index has to exist.** Mongoose builds indexes in the background when a model is first used (`autoIndex`). In tests or scripts that insert immediately, wait for it with `await User.init()` (or `syncIndexes()`). In production, teams often turn `autoIndex` off and manage indexes in deploy scripts — building an index on a big collection is not free.
2. **It can't be created if duplicates already exist.** Add `unique` to a field that already has duplicates and the index build fails (in the background, quietly, with autoIndex). Then you have no uniqueness at all and no idea why. Clean the data first.

You can also declare indexes on the schema itself — including **compound** ones, over several fields:

```ts
// a user can review a given book only once
reviewSchema.index({ book: 1, user: 1 }, { unique: true });
```

Uniqueness applies to the *combination*: the same user can review many books, many users can review the same book.

## Defaults

```ts
status: { type: String, default: 'DRAFT' },
publishedAt: { type: Date, default: Date.now },   // a function: called per document ✔
// publishedAt: { type: Date, default: Date.now() }  // a value: computed ONCE at startup ✘
```

That last line is a real bug: every document gets the timestamp of when your server *booted*. Pass the function, don't call it.

```quiz
Q: You add `unique: true` to `email`, then immediately insert two users with the same email in a test. Both inserts succeed. What's the most likely reason?
- [ ] `unique` only works with `required`
- [x] The unique index hadn't been built yet when the inserts ran
- [ ] Mongoose validators are skipped by `create()`
> Indexes are created asynchronously. `await User.init()` (or `syncIndexes()`) before inserting. And remember: the duplicate is rejected by MongoDB with code 11000, not by a Mongoose validator.
```

```quiz
Q: A custom validator needs to compare two fields of the same document. Which form works?
- [ ] `validator: (v) => v > this.start`
- [x] `validator: function (v) { return v > this.start; }`
- [ ] `validator: (v, doc) => v > doc.start`
> Arrow functions don't get their own `this`; Mongoose calls the validator with `this` bound to the document, so you need a regular function.
```
