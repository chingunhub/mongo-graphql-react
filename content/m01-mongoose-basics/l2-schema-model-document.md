---
title: "Schema → Model → Document"
minutes: 15
---

Mongoose has three core ideas, and almost every confusing Mongoose moment comes from mixing them up. So let's get them very clear.

```viz-flow
{
  colWidth: 215,
  nodes: [
    { id: 's', label: 'Schema', sub: 'the rules', col: 0, row: 0, color: 'mongo' },
    { id: 'm', label: 'Model', sub: 'Book — the class', col: 1, row: 0, color: 'mongo' },
    { id: 'd', label: 'Document', sub: 'one book', col: 2, row: 0, color: 'mongo' },
    { id: 'c', label: 'books collection', sub: 'in MongoDB', col: 1, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 's', to: 'm', label: 'mongoose.model()' },
    { from: 'm', to: 'd', label: 'new / find' },
    { from: 'm', to: 'c', label: 'talks to', dashed: true },
  ],
  steps: [
    { focus: ['s'], caption: 'A **Schema** describes shape and rules: field types, required fields, defaults, validators. It does nothing on its own — it\'s a blueprint.' },
    { focus: ['s>m', 'm'], caption: 'A **Model** is a class compiled from a schema and bound to a collection. Static methods like `Book.find()` and `Book.create()` live here.' },
    { focus: ['m>c', 'c'], caption: 'The model knows its collection: `Book` → `books` (lowercased and pluralized). Every query you write goes through it.' },
    { focus: ['m>d', 'd'], caption: 'A **Document** is an *instance* of the model — one book. It has your fields plus superpowers: `save()`, change tracking, getters, virtuals like `id`.' },
  ],
}
```

## The schema

```ts title="models/Book.ts" {3-8,10}
import mongoose, { Schema } from 'mongoose';

const bookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    year: Number,
    tags: [String],
    author: { type: String, required: true },
  },
  { timestamps: true },
);

export const Book = mongoose.model('Book', bookSchema);
```

Each field is either a **shorthand** (`year: Number`) or an **options object** (`{ type: String, required: true, trim: true }`). Use the shorthand when there are no rules; the moment you need one, switch to the object form.

`[String]` means "array of strings". Arrays get an empty default (`[]`) automatically — a book without tags has `tags: []`, not `undefined`.

`{ timestamps: true }` (the second argument — **schema options**, not a field) adds `createdAt` and `updatedAt` and keeps them current. You'll want this on almost every model; questions like "what changed recently?" come up in every real app.

Some options transform values on the way in. These are called **setters**:

| Option | On `String` | Example |
| --- | --- | --- |
| `trim: true` | strip whitespace | `"  Dune "` → `"Dune"` |
| `lowercase: true` | lowercase | `"Ada@Mail.COM"` → `"ada@mail.com"` |
| `uppercase: true` | uppercase | `"tf"` → `"TF"` |

A nice detail: setters run on **query filters** too. With `email: { type: String, lowercase: true }`, `User.findOne({ email: "ADA@MAIL.COM" })` searches for the lowercase version. Mongoose casts your filter through the schema before sending it.

## The model

`mongoose.model('Book', bookSchema)` compiles the schema into a class and registers it under the name `'Book'`. That name matters in two places:

- the **collection name** is derived from it: `'Book'` → `books`, `'Person'` → `people` (yes, it knows some irregular plurals), `'Category'` → `categories`;
- **references** between models use it — `ref: 'Book'` in Module 4.

> [!WARNING]
> Registering the same model name twice throws `OverwriteModelError`. You'll hit this with hot reloading or when a file is imported twice under different paths. Define each model once, in its own file, and import it everywhere else.

### Connecting

In a real app you call `mongoose.connect(uri)` **once** at startup. You don't need to wait for it before using models: Mongoose **buffers** commands until the connection is ready, then flushes them.

```viz-sequence
{
  actors: [
    { id: 'app', label: 'your code', color: 'neutral' },
    { id: 'm', label: 'Mongoose', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'm', label: 'mongoose.connect(uri)', note: 'Starts connecting in the background and returns a promise.' },
    { from: 'app', to: 'm', label: 'Book.find()', note: 'Not connected yet — Mongoose **buffers** the command instead of failing.' },
    { from: 'm', to: 'db', label: 'handshake', note: 'Connection established…' },
    { from: 'm', to: 'db', label: 'find books', note: '…and buffered commands are flushed in order.' },
    { from: 'db', to: 'm', label: 'documents', ret: true },
    { from: 'm', to: 'app', label: 'Book[]', ret: true, note: 'Your `await` resolves. If the connection never succeeds, buffered commands time out after 10s with a "buffering timed out" error — a classic sign that the URI is wrong or the DB is down.' },
  ],
}
```

In this course's sandbox, **we connect for you** before your code runs, to a fresh database. That's why task code only defines and uses models. In the finale you'll write the startup code yourself.

## Documents: creating and saving

Two ways to insert:

```ts
// 1. build, then save
const book = new Book({ title: 'Dune', author: 'Frank Herbert', year: 1965 });
console.log(book._id); // already set — the driver generated it
await book.save();

// 2. create = new + save in one call
const book2 = await Book.create({ title: 'Kindred', author: 'Octavia E. Butler', year: 1979 });
```

Here's what actually happens inside `create`:

```viz-sequence
{
  actors: [
    { id: 'app', label: 'your code', color: 'neutral' },
    { id: 'doc', label: 'Document', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'doc', label: "create({ year: '1965', … })", note: 'A new Document is built from your plain object.' },
    { from: 'doc', to: 'doc', label: 'cast', note: '**Casting**: each value is converted to the schema type. `"1965"` becomes `1965`. Unknown fields are **dropped** (strict mode). `"abc"` for a Number becomes a CastError.', payload: "{ title: 'Dune', year: 1965 }   // year was the string '1965'", lang: 'ts' },
    { from: 'doc', to: 'doc', label: 'setters + defaults', note: '`trim`, `lowercase` etc. run; missing fields with a `default` get it; arrays default to `[]`; timestamps are set.' },
    { from: 'doc', to: 'doc', label: 'validate', note: '**Validation**: `required`, `min`, `enum`… If anything fails, you get a `ValidationError` and **nothing is written**. (Module 2 goes deep here.)' },
    { from: 'doc', to: 'db', label: 'insertOne', note: 'Only now does anything touch the database.' },
    { from: 'db', to: 'doc', label: 'ack', ret: true },
    { from: 'doc', to: 'app', label: 'Document', ret: true, note: 'You get back the Document — with `_id`, `createdAt`, `__v` (a version key Mongoose uses internally; ignore it).' },
  ],
}
```

> [!CAUTION]
> **Strict mode silently drops fields that aren't in the schema.** `Book.create({ title: 'Dune', autor: 'Herbert' })` — note the typo — fails validation because `author` is required. But if `author` weren't required, the typo would just vanish and you'd wonder why the author is never saved. When data "disappears", check the schema first.

## Documents: finding

```ts
const all = await Book.find();                         // Book documents (array, maybe empty)
const old = await Book.find({ year: { $lt: 1970 } });  // filter
const one = await Book.findOne({ title: 'Dune' });     // first match or null
const byId = await Book.findById(someId);              // by _id (string ok — it's cast), or null
```

`find` returns an **array** (possibly empty). `findOne`/`findById` return **a document or `null`** — never `undefined`, and they don't throw when nothing matches. Handle the `null`.

These methods return a **Query**, not a promise. A Query is a builder you can keep chaining until you `await` it:

```ts
const recent = await Book.find({ tags: 'scifi' })
  .sort({ year: -1 })     // newest first
  .limit(5)
  .select('title year');  // projection: only these fields (+ _id)
```

The query executes when you `await` it (it's "thenable"). Until then you're just describing it, which is why you can build queries step by step — something you'll do a lot in Module 3.

### Documents vs lean objects

By default you get full **Mongoose documents**. They're heavy: change tracking, getters, methods. When you only need to *read* and send data somewhere, ask for **plain objects** with `.lean()`:

```compare
--- a Document (default)
const b = await Book.findOne({ title: 'Dune' });
b.id;            // "66f1…" — a virtual string getter
b.title = 'Dune Messiah';
await b.save();  // works: it's a live document
b instanceof Book; // true
--- a lean object
const b = await Book.findOne({ title: 'Dune' }).lean();
b.id;            // undefined! — no virtuals on plain objects
b._id;           // ObjectId(…) — still here
b.save;          // undefined — it's just data
// much smaller in memory, faster to create
```

That `id` difference will matter a lot in Part II: GraphQL types usually have an `id` field, and if a resolver returns a lean object, `id` quietly comes out `null`. Remember this one.

## The worked example

Let's finish the Bookshelf model with a small "repository" function — a function that wraps a query so the rest of the app doesn't build filters by hand:

```ts title="models/Book.ts"
export function findBooksByAuthor(author: string) {
  return Book.find({ author }).sort({ year: 1 });
}
```

```ts title="playground.ts"
import { Book, findBooksByAuthor } from './models/Book';

await Book.create([
  { title: 'The Dispossessed', author: 'Ursula K. Le Guin', year: 1974 },
  { title: 'A Wizard of Earthsea', author: 'Ursula K. Le Guin', year: 1968 },
  { title: 'Kindred', author: 'Octavia E. Butler', year: 1979 },
]);

const books = await findBooksByAuthor('Ursula K. Le Guin');
console.log(books.map((b) => `${b.year} ${b.title}`));
// [ '1968 A Wizard of Earthsea', '1974 The Dispossessed' ]
```

Note `Book.create([...])` with an **array** inserts several documents (and still validates each one).

```quiz
Q: `Book.findOne({ title: 'Nope' })` when no such book exists:
- [ ] throws a NotFound error
- [x] resolves to `null`
- [ ] resolves to `undefined`
- [ ] resolves to `[]`
> `findOne` and `findById` resolve to `null` when nothing matches. `find` resolves to an empty array.
```

```quiz
Q: A resolver returns `await Book.findById(id).lean()` and the GraphQL `id` field comes back `null`. Why?
- [ ] `lean()` strips `_id`
- [x] `id` is a virtual getter on documents; plain lean objects don't have it
- [ ] `findById` doesn't work with lean
> Lean objects keep `_id` but have no virtuals. Either drop `.lean()` or map `_id` to `id` yourself — you'll do the latter in Part II.
```

You've got enough to write your first model. The drill next is the same shape as Bookshelf, with a few things the example didn't do.
