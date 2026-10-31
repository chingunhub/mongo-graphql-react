---
title: Virtuals and virtual populate
minutes: 14
---

Last lesson ended with a puzzle: comments store `comment.issue`, so how does an issue get *its* comments without storing an array of comment ids? Answer: **virtual populate**. But first, plain virtuals.

## Virtuals: computed properties

A virtual is a property that exists on the document but **not in the database**. You've been using one all along — `doc.id` is a virtual that returns `String(doc._id)`.

```ts title="models/Book.ts"
bookSchema.virtual('age').get(function () {
  return new Date().getFullYear() - this.year;
});

bookSchema.virtual('slug').get(function () {
  return this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
});
```

```ts
const book = await Book.findOne({ title: 'Kindred' });
book.age;   // 47 (in 2026)
book.slug;  // "kindred"
```

What virtuals **can't** do, because they aren't stored:

- You can't query or sort by them: `Book.find({ age: { $gt: 40 } })` matches nothing.
- `.lean()` objects don't have them (same reason `id` disappears).
- They're **not** included in `toJSON()` / `toObject()` unless you ask:

```ts
const bookSchema = new Schema({ ... }, {
  toJSON: { virtuals: true },   // res.json(book) includes virtuals
  toObject: { virtuals: true }, // console.log / spreads include them
});
```

Rule of thumb: a value derived from *this document's own fields* that's cheap to compute → virtual. Something you need to filter or sort on → store it as a real field (and keep it updated, which is Module 5's middleware).

## Virtual populate: "has many" without the array

Back to the puzzle. Books reference their author (`book.author`). We want `author.books`:

```ts title="models/Author.ts"
authorSchema.virtual('books', {
  ref: 'Book',            // which model to query
  localField: '_id',      // value on THIS document…
  foreignField: 'author', // …matched against this field on the OTHER model
});
```

Read it as a sentence: *"`books` are the `Book`s whose `author` equals my `_id`."* Nothing is stored on the author. When you populate it, Mongoose runs the reverse query:

```viz-sequence
{
  actors: [
    { id: 'app', label: 'your code', color: 'neutral' },
    { id: 'm', label: 'Mongoose', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'm', label: "Author.findById(id).populate('books')" },
    { from: 'm', to: 'db', label: 'authors.findOne({ _id })', note: 'Query 1: the author.' },
    { from: 'm', to: 'db', label: "books.find({ author: { $in: [authorId] } })", note: 'Query 2: localField values (`_id`) matched against foreignField (`author`). For a *list* of authors, all their ids go into one `$in`.' },
    { from: 'm', to: 'app', label: 'author.books = [Book, Book…]', ret: true, note: 'Mongoose groups the books by author and attaches them. An author with no books gets `[]`.' },
  ],
}
```

> [!WARNING] The #1 virtual populate bug
> Swap `localField` and `foreignField` and you get **empty arrays**, no error. `localField` is on the document you're populating *from* (the author: `_id`); `foreignField` is on the documents being fetched (books: `author`). If a virtual populate returns `[]` and you're sure the data exists, check these two first.

### Options: sorting, filtering, counting

Virtual populate accepts `options`, `match` and `count` — either in the definition or at populate time:

```ts
// define a default order on the virtual
authorSchema.virtual('books', {
  ref: 'Book', localField: '_id', foreignField: 'author',
  options: { sort: { year: -1 } },
});

// or pass them when populating
Author.findById(id).populate({
  path: 'books',
  match: { format: { $ne: 'EBOOK' } }, // only some books
  select: 'title year',
  options: { sort: { year: 1 } },
});

// count instead of loading
authorSchema.virtual('bookCount', {
  ref: 'Book', localField: '_id', foreignField: 'author',
  count: true, // populates a NUMBER
});
await Author.findById(id).populate('bookCount'); // author.bookCount === 7
```

`count: true` runs a count query instead of loading documents — much cheaper when you only need "7 books".

> [!WARNING]
> Those are two places to put a sort, so pick one. If the virtual has a default `sort`, it wins over a `sort` passed to `populate()`, with no error. The example above would still come back newest first.

> [!NOTE]
> `options.limit` on a populate applies across **all** parent documents combined, not per parent. Populating 2 authors with `{ options: { limit: 1 } }` gives the first author 1 book and the second author **0** (checked in this sandbox's Mongoose). For "the 3 latest books for each author", use `perDocumentLimit: 3` instead (it runs one query per parent), or an aggregation. A good example of the kind of footnote that becomes a production bug in a big codebase.

## Putting it together

```ts title="models/Author.ts"
const authorSchema = new Schema(
  { name: { type: String, required: true } },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } },
);
authorSchema.virtual('books', {
  ref: 'Book', localField: '_id', foreignField: 'author',
  options: { sort: { year: 1 } },
});
authorSchema.virtual('bookCount', {
  ref: 'Book', localField: '_id', foreignField: 'author', count: true,
});
export const Author = mongoose.model('Author', authorSchema);
```

```ts title="playground.ts"
const author = await Author.findOne({ name: 'Octavia E. Butler' })
  .populate({ path: 'books', select: 'title year' })
  .populate('bookCount');

console.log(author.bookCount);                 // 2
console.log(author.books.map((b) => b.title)); // [ 'Kindred', 'Dawn' ]
console.log(author.toJSON());                  // includes id, books, bookCount
```

## The N+1 shape, one more time

```viz-flow
{
  title: 'Loading 3 authors with their book counts',
  colWidth: 190,
  rowHeight: 62,
  nodes: [
    { id: 'a', label: 'find authors', sub: '1 query', col: 0, row: 1, color: 'mongo' },
    { id: 'p', label: "populate('bookCount')", sub: '+1 query ($in)', col: 1, row: 1, color: 'ok', w: 170 },
    { id: 'l1', label: 'countDocuments', sub: 'author 1', col: 3, row: 0, color: 'bad' },
    { id: 'l2', label: 'countDocuments', sub: 'author 2', col: 3, row: 1, color: 'bad' },
    { id: 'l3', label: 'countDocuments', sub: 'author 3', col: 3, row: 2, color: 'bad' },
    { id: 'loop', label: 'for … await', sub: 'in a loop', col: 2, row: 1, color: 'bad' },
  ],
  edges: [
    { from: 'a', to: 'p', label: '2 total' },
    { from: 'a', to: 'loop', dashed: true },
    { from: 'loop', to: 'l1' },
    { from: 'loop', to: 'l2' },
    { from: 'loop', to: 'l3' },
  ],
  steps: [
    { focus: ['a', 'a>p', 'p'], caption: '**Batched:** populate collects every author id and runs one counting query for all of them. 2 queries whether you have 3 authors or 3,000.' },
    { focus: ['a', 'a>loop', 'loop', 'loop>l1', 'loop>l2', 'loop>l3', 'l1', 'l2', 'l3'], caption: '**N+1:** a loop that awaits a query per item. 1 + N queries, each a network round trip. Fine for 3, painful for 300 — and it hides in code that *looks* innocent.' },
  ],
}
```

```quiz
Q: Comments store `comment.post`. Which virtual on Post gives `post.comments`?
- [ ] `{ ref: 'Comment', localField: 'post', foreignField: '_id' }`
- [x] `{ ref: 'Comment', localField: '_id', foreignField: 'post' }`
- [ ] `{ ref: 'Post', localField: '_id', foreignField: 'comments' }`
> "Comments whose `post` equals my `_id`": localField is on the Post (`_id`), foreignField is on the Comment (`post`). Swapping them returns empty arrays without any error.
```
