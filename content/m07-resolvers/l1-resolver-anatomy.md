---
title: "Resolver anatomy, with Mongoose in the loop"
minutes: 18
---

You've seen resolvers as "one function per field". Now let's connect them to real Mongoose models, because the seam between *what Mongoose gives you* and *what GraphQL expects* is where most resolver bugs live. Each one in this lesson was checked against the libraries in this sandbox.

> [!BRIDGE]
> A resolver is the closest thing GraphQL has to an Express route handler:
>
> ```ts
> // Express: the URL picks a handler, and the handler writes the response
> app.get('/books/:id', async (req, res) => {
>   const book = await Book.findById(req.params.id);
>   if (!book) return res.status(404).json({ error: 'Not found' });
>   res.json(book);
> });
>
> // GraphQL: the query picks the fields, and each resolver returns a value
> const resolvers = {
>   Query: {
>     book: (_parent, args) => Book.findById(args.id),
>   },
> };
> ```
>
> Three habits change. There's no `res`, because you return a value and Apollo builds the response. `req.params`, `req.query` and `req.body` all become `args`. And one request can call many resolvers, one per field, where Express runs one handler.

## The four arguments

```ts
someField(parent, args, context, info) { … }
```

```viz-flow
{
  colWidth: 200,
  rowHeight: 74,
  nodes: [
    { id: 'parent', label: 'parent', sub: 'value of the parent field', col: 0, row: 0, color: 'gql' },
    { id: 'args', label: 'args', sub: "this field's arguments", col: 0, row: 1, color: 'gql' },
    { id: 'ctx', label: 'context', sub: 'per-request, shared', col: 0, row: 2, color: 'gql' },
    { id: 'info', label: 'info', sub: 'AST, path, schema', col: 0, row: 3, color: 'neutral' },
    { id: 'r', label: 'resolver', sub: 'returns a value or a promise', col: 2, row: 1.5, color: 'forge', w: 190 },
  ],
  edges: [
    { from: 'parent', to: 'r' }, { from: 'args', to: 'r' }, { from: 'ctx', to: 'r' }, { from: 'info', to: 'r', dashed: true },
  ],
  steps: [
    { focus: ['parent', 'parent>r', 'r'], caption: '**parent** — whatever the parent field\'s resolver returned. For `Book.author`, it\'s the book. For root fields (`Query.*`), it\'s usually `undefined`. Name it after what it is: `(book) => …`, not `(parent) => …`.' },
    { focus: ['args', 'args>r', 'r'], caption: '**args** — this field\'s arguments, already validated and coerced: enums are strings, `Int`s are numbers, input objects are plain objects. Arguments the client **didn\'t send** are absent; defaults from the SDL are filled in.' },
    { focus: ['ctx', 'ctx>r', 'r'], caption: '**context** — one object created **per request** and passed to every resolver in it. The current user, per-request caches (DataLoaders), sometimes services. Module 8 is all about it.' },
    { focus: ['info', 'info>r', 'r'], caption: '**info** — the field\'s AST, path, return type and schema. Rarely needed in app code; libraries use it (e.g. to see which subfields were requested).' },
  ],
}
```

Resolvers can return a value **or a promise**, and GraphQL awaits it. But here's a trap that's specific to Mongoose + Apollo Server (and it bit this course while it was being written):

```ts
Query: {
  book: (_parent, { id }) => Book.findById(id), // ✘ returns a Mongoose Query, not a Promise
},
```

```json
{ "errors": [{ "message": "Query was already executed: Book.findOne({ _id: … })" }] }
```

A Mongoose `Query` is *thenable* — it runs when `.then()` is called. Apollo Server's plugin instrumentation calls `.then()` on resolver results to time them, and GraphQL calls `.then()` again to get the value. The second call re-executes the query, and Mongoose refuses. **Always hand GraphQL a real Promise:**

```ts
Query: {
  book: async (_parent, { id }) => await Book.findById(id), // ✔ async + await
  books: () => Book.find().exec(),                           // ✔ .exec() returns a Promise
},
```

(Repository functions declared `async` are already safe: an `async` function always returns a real Promise.)

## Trap 1: `id` and `.lean()`

`id: ID!` on a type, and a resolver that returns a lean object:

```ts
Query: { books: () => Book.find().lean() },
```

```json
{ "errors": [{ "message": "Cannot return null for non-nullable field Book.id." }], "data": null }
```

The default resolver reads `book.id` — a **virtual** that lean objects don't have (Module 1, Module 4…it keeps coming back). Two fixes:

- don't use `.lean()` for objects you hand to GraphQL, or
- add a tiny resolver that works for both: `Book: { id: (book) => String(book._id) }`.

The second is the robust one. In a big codebase you can't see from the `Book` type resolvers which of fifteen query paths produced the object, so make the type resolvers work for documents **and** plain objects.

## Trap 2: Dates come out as numbers

Mongoose gives you `Date` objects. Your schema says `createdAt: String!`. Return the Date as-is and…

```json
{ "createdAt": "1774224000000" }
```

…you get **milliseconds since 1970, as a string**. GraphQL's `String` serializer coerces objects via `valueOf()`, and a Date's `valueOf()` is a number. It's not an error, so it ships, and then every frontend date displays as "Invalid Date". Be explicit:

```ts
Book: {
  createdAt: (book) => book.createdAt.toISOString(),
},
```

(A custom `DateTime` scalar does this centrally — a good refactor for a big codebase, but explicit conversion is clearer while learning.)

## Trap 3: references are ObjectIds, not objects

```ts
// Mongoose: book.author is an ObjectId
// GraphQL:  Book.author is Author!
```

With no `Book.author` resolver, the default resolver returns the ObjectId, and GraphQL tries to read `name` *from an ObjectId* — `null`, then a non-null error. Every reference field needs a resolver that **loads the referenced document**:

```ts
Book: {
  author: (book) => Author.findById(book.author).exec(),
},
```

There's a subtle variant: if the root resolver *did* `populate('author')`, then `book.author` is already a document, and `Author.findById(book.author)` still works (Mongoose casts a document to its `_id`)… but it queries again for nothing. A helper that accepts "an id or a populated doc" keeps field resolvers honest:

```ts
const idOf = (ref) => (ref?._id ?? ref); // ObjectId or populated document → id
```

### Eager or lazy?

So should the *root* resolver populate everything, or should *field* resolvers load on demand?

```compare
--- eager: populate in the root resolver
Query: {
  book: (_, { id }) =>
    Book.findById(id).populate('author').populate('reviews').exec(),
}
// ✔ few, predictable queries
// ✘ loads author + reviews even when the
//   query only asked for { title }
--- lazy: field resolvers
Query: { book: (_, { id }) => Book.findById(id).exec() },
Book: {
  author: (book) => Author.findById(book.author).exec(),
  reviews: (book) => Review.find({ book: book._id }).exec(),
}
// ✔ only loads what the query selected
// ✘ in lists: one query per item (N+1)…
//   until Module 9's DataLoader
```

The GraphQL-native answer is **lazy field resolvers + batching** (DataLoader, Module 9): you only fetch what was asked for, and you still fetch it in a few queries. Taskforge goes lazy now and adds batching later — so you'll *see* the N+1 problem in a query log before you fix it.

## Trap 4: arguments that weren't sent

GraphQL distinguishes "argument omitted" from "argument explicitly null":

```graphql
updateBook(id: "b1", input: { title: "New" })             # input = { title: "New" }
updateBook(id: "b1", input: { title: "New", year: null })  # input = { title: "New", year: null }
```

In the resolver, omitted fields are **absent** (`undefined`), explicit nulls are `null`. That maps perfectly onto partial updates: "not mentioned → leave it alone", "null → clear it". Your Taskforge repository already treats `undefined` and `null` differently — the GraphQL layer just has to pass them through without flattening one into the other. (`input.year || null` would turn "not sent" into "clear it". Careful with `||` in resolvers.)

## Enums map straight through

GraphQL enum values arrive in resolvers as strings (`'SCIFI'`) and go out the same way — matching Mongoose enums with the same spelling means zero mapping code. Keep them identical, and when someone asks for a *different* internal value, push back: two names for one thing is a big-codebase tax.

## A small but complete example

```ts title="graphql/resolvers.ts"
import mongoose from 'mongoose';
import { Book } from '../models/Book';
import { Author } from '../models/Author';

const idOf = (ref: any) => ref?._id ?? ref;

export const resolvers = {
  Query: {
    books: (_: unknown, { tag }: { tag?: string }) =>
      Book.find(tag ? { tags: tag } : {}).sort({ year: 1, _id: 1 }).lean().exec(),
    book: async (_: unknown, { id }: { id: string }) =>
      mongoose.isValidObjectId(id) ? await Book.findById(id) : null, // bad ids → null, not a CastError
  },
  Book: {
    id: (book: any) => String(book._id),              // works for lean and documents
    author: (book: any) => Author.findById(idOf(book.author)).exec(),
    createdAt: (book: any) => book.createdAt.toISOString(),
  },
};
```

```quiz
Q: A field `createdAt: String!` has no resolver; the parent is a Mongoose document. What does the client receive?
- [ ] An ISO date like "2026-03-23T00:00:00.000Z"
- [x] A string of milliseconds like "1774224000000"
- [ ] An error: Date is not a String
> GraphQL's String serializer uses `valueOf()` on objects, and Date's valueOf is a timestamp number. Convert with `toISOString()` in a resolver (or use a custom scalar).
```

```quiz
Q: `Book.author: Author!` has no resolver, and books store `author` as an ObjectId. A query asks for `author { name }`. Result?
- [ ] The author's name — GraphQL follows the ref automatically
- [x] An error: `name` resolves to null from the ObjectId, and it's non-null
- [ ] An empty object
> GraphQL knows nothing about Mongoose refs. A reference field needs a resolver that loads the document.
```
