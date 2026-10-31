---
title: Hooks, methods and statics
minutes: 18
---

So far your models have been data plus rules. This lesson adds **behavior**: code that runs automatically around database operations (middleware, a.k.a. hooks), and functions that live on your models (methods and statics). In a big codebase this is where "magic" lives — things that happen without anyone calling them — so knowing *exactly* when they run is what lets you debug them.

## Middleware: code around operations

```ts title="models/Book.ts"
bookSchema.pre('save', async function () {
  // `this` is the document about to be saved
  if (this.isModified('isbn')) {
    this.isbn = this.isbn.replace(/[-\s]/g, ''); // store ISBNs without dashes
  }
});

bookSchema.post('save', function (doc) {
  console.log(`saved book ${doc._id}`);
});
```

`pre` hooks run before the operation, `post` hooks after. A pre hook can change the document, or **throw** to abort the operation — the error propagates to whoever called `save()`.

> [!IMPORTANT] Mongoose 9: no more `next()`
> Older code (and most tutorials online) write `pre('save', function (next) { …; next(); })`. **Mongoose 9 removed the `next` callback** from pre middleware — the first argument is now the options passed to the call, if there were any, and calling it as a function throws. Write hooks as `async function () { … }` and `throw` to abort. Spotting this pattern in old code is exactly the kind of thing you'll do when upgrading a big codebase.

### The order of a save

```viz-sequence
{
  actors: [
    { id: 'app', label: 'your code', color: 'neutral' },
    { id: 'doc', label: 'Document', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'doc', label: 'doc.save()' },
    { from: 'doc', to: 'doc', label: "pre('validate')", note: 'Runs first — a good place to fill in values that validation will then check.' },
    { from: 'doc', to: 'doc', label: 'validate', note: 'Built-in and custom validators. Fail here and nothing else runs.' },
    { from: 'doc', to: 'doc', label: "pre('save')", note: '**After** validation. So `minlength: 8` on a password checks the *plain* password, and then a pre-save hook can hash it. That order is not an accident.' },
    { from: 'doc', to: 'db', label: 'insertOne / updateOne', note: 'For an existing document, only **modified paths** are sent (`$set`), not the whole document.' },
    { from: 'db', to: 'doc', label: 'ack', ret: true },
    { from: 'doc', to: 'doc', label: "post('save')", note: 'Gets the saved doc. Good for side effects: logging, emitting an event, invalidating a cache.' },
    { from: 'doc', to: 'app', label: 'doc', ret: true },
  ],
}
```

Inside document middleware, two methods earn their keep:

- `this.isModified('field')` — did this field change since the doc was loaded (or is the doc new)? Use it to avoid redoing work on every save.
- `this.isNew` — is this the first save (an insert)?

> [!BRIDGE]
> Express middleware wraps an HTTP request: `app.use((req, res, next) => …)`. Mongoose middleware wraps a database operation: `schema.pre('save', …)`. Same word, same idea of code running around something, different trigger. A `pre('save')` hook also runs for a seed script or a background job, where there's no request at all.

## The question that matters: which hooks run when?

There are two kinds of middleware, and they're triggered by different operations:

- **Document middleware** (`validate`, `save`): `this` is a **document**. Runs when you work through documents.
- **Query middleware** (`find`, `findOne`, `updateOne`, `findOneAndUpdate`, `deleteOne`, `countDocuments`…): `this` is the **Query**. Runs when you work through queries.

That split produces the most common hook bug there is. Here's what actually fires (checked against the Mongoose in this sandbox):

| You call | Hooks that run | `save` hooks? |
| --- | --- | --- |
| `Book.create(data)` / `doc.save()` | `validate`, `save` (document) | ✔ |
| `Book.insertMany([...])` | `insertMany` (model), `validate` | ✘ |
| `Book.updateOne(filter, update)` | `updateOne` (query) | ✘ |
| `doc.updateOne(update)` | `updateOne` (**query**, by default) | ✘ |
| `Book.findOneAndUpdate(...)` | `findOneAndUpdate` (query) | ✘ |
| `Book.findById(id)` | `findOne` (query) | — |
| `doc.deleteOne()` | `deleteOne` (**query**, by default) | — |

```viz-flow
{
  title: 'The classic bug',
  colWidth: 210,
  rowHeight: 76,
  nodes: [
    { id: 'hook', label: "pre('save'): hash password", col: 1, row: 0, color: 'mongo', w: 200 },
    { id: 'signup', label: 'signUp()', sub: 'User.create()', col: 0, row: 0, color: 'ok' },
    { id: 'reset', label: 'resetPassword()', sub: 'User.updateOne()', col: 0, row: 1, color: 'bad' },
    { id: 'db', label: 'users', sub: 'MongoDB', col: 2, row: 0.5, color: 'neutral' },
  ],
  edges: [
    { from: 'signup', to: 'hook' },
    { from: 'hook', to: 'db', label: 'hashed ✔' },
    { from: 'reset', to: 'db', label: 'PLAIN TEXT ✘', color: 'bad' },
  ],
  steps: [
    { focus: ['signup', 'signup>hook', 'hook', 'hook>db', 'db'], caption: 'Sign-up goes through `create()` → `save()`, so the pre-save hook hashes the password. Tests pass, ship it.' },
    { focus: ['reset', 'reset>db', 'db'], caption: 'Months later, someone writes password reset with `updateOne` because it\'s "simpler". **Save hooks don\'t run for update queries.** The new password is stored in plain text, and nothing errors.' },
  ],
}
```

When a rule *must* hold no matter how data is written, either cover the query paths too (query middleware can read and change the update via `this.getUpdate()` / `this.setUpdate()`), or make the team rule "this model is only ever written through documents" — and enforce it in review.

### Query middleware

`this` is the Query. You can inspect and modify it:

```ts
// auto-populate the author on every find* — convenient, and a little dangerous
bookSchema.pre(/^find/, function () {
  this.populate('author', 'name');
});
```

A regex like `/^find/` matches every hook whose name starts with "find": `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`… but **not** `countDocuments` (which is how you get a page that says "12 results" above a list of 10).

Useful Query methods inside hooks:

| Method | Gives you |
| --- | --- |
| `this.getFilter()` | the filter object |
| `this.where({...})` | adds conditions to the filter |
| `this.getUpdate()` / `this.setUpdate(u)` | the update document (update hooks) |
| `this.getOptions()` | query options — including **your own**, passed with `.setOptions({ myFlag: true })` |

That auto-populate example, by the way, is a classic big-codebase surprise: someone adds it, and six months later a hot path is mysteriously doing two queries where it looks like one. Implicit behavior has a cost — use hooks for things that should *truly* always happen.

### Error-handling post hooks

A `post` hook with **three** parameters `(error, doc, next)` runs when the operation failed. The classic use: turning a duplicate-key error into something readable:

```ts
userSchema.post('save', function (error: any, _doc: unknown, next: (e?: Error) => void) {
  if (error?.code === 11000) next(new Error('That email is already registered'));
  else next(error);
});
```

(Error-handling post hooks still take `next` in Mongoose 9 — it's pre hooks that lost it.)

## Methods, statics, virtuals: which one?

```ts
// instance method: behavior of ONE document — `this` is the doc
bookSchema.methods.isClassic = function () {
  return this.year < new Date().getFullYear() - 50;
};

// static: behavior of the MODEL — `this` is the Model
bookSchema.statics.findByIsbn = function (isbn: string) {
  return this.findOne({ isbn: isbn.replace(/[-\s]/g, '') });
};
```

```ts
const book = await Book.findByIsbn('978-0-8070-8305-4'); // static, on the model
book?.isClassic();                                        // method, on a document
```

| | Called on | `this` is | Use for |
| --- | --- | --- | --- |
| **virtual** | a document (as a property) | the document | derived values: `book.age`, `user.fullName` |
| **method** | a document | the document | actions/questions about one doc: `user.checkPassword(p)`, `order.cancel()` |
| **static** | the model | the Model | finders and factories: `Book.findByIsbn()`, `Issue.createInProject()` |
| **repository function** | — | — | queries that span models or need app context |

> [!WARNING]
> Methods, statics and hooks need `function`, not arrow functions. An arrow function captures `this` from the surrounding module, so `this.year` is `undefined` and you get baffling `NaN`s.

Where should logic live — static or repository? There's no universal rule. A decent one: **statics for operations that are about this model's own invariants** (generating its next number, finding by its natural key), **repositories/services for use-case logic** (what a resolver needs, anything touching several models). Taskforge uses both.

```quiz
Q: A `pre('save')` hook lowercases `email`. An admin script runs `User.updateMany({}, { $set: { email: 'MIXED@Case.com' } })`. What's stored?
- [ ] `mixed@case.com` — the hook runs for every document
- [x] It depends on the schema: the hook doesn't run, but a `lowercase: true` setter would still apply to the `$set`
- [ ] Nothing — updateMany is blocked by save hooks
> `updateMany` triggers query middleware, never `save`. Schema *setters* are applied during update casting though — one reason to prefer setters over hooks for simple normalization.
```

```quiz
Q: A soft-delete hook uses `pre(/^find/, …)` to hide deleted docs. The page shows "Showing 10 of 12" but lists 10 items with 2 deleted ones excluded. What's going on?
- [x] `countDocuments` isn't matched by `/^find/`, so the count includes deleted documents
- [ ] The regex is wrong
- [ ] Soft-deleted docs can't be counted
> Register the same hook for `countDocuments` too: `schema.pre(['countDocuments', /^find/], …)` — or keep counts and lists going through one function.
```
