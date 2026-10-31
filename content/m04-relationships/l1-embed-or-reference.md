---
title: Embed or reference? And how populate really works
minutes: 18
---

In SQL, relationships are mostly decided for you: normalize, add foreign keys, join. In MongoDB you get a real choice for every relationship, and it shapes your queries, your performance and your bugs for the lifetime of the app. When you open the models folder of a big codebase, being able to read *why* something is embedded or referenced tells you a lot about how the data is used.

## The two shapes

```compare
--- embed: the child lives inside the parent
// books
{
  _id: …,
  title: "Kindred",
  reviews: [
    { by: "sam", rating: 5, text: "…" },
    { by: "kai", rating: 4, text: "…" }
  ]
}
--- reference: the child has its own collection
// books
{ _id: ObjectId("b1"), title: "Kindred",
  author: ObjectId("a7") }

// authors
{ _id: ObjectId("a7"),
  name: "Octavia E. Butler" }
```

## A decision framework

Ask these questions, roughly in order:

| Question | Points to **embed** | Points to **reference** |
| --- | --- | --- |
| How many children per parent? | a few, bounded (≤ ~100) | many, or *unbounded* |
| Are they read together? | almost always | often separately |
| Does the child exist on its own? | no — meaningless without the parent | yes — has its own lifecycle, own pages |
| Is the child shared by many parents? | no | yes (an author has many books) |
| How often does the child change? | rarely, together with the parent | often, independently |

```viz-flow
{
  title: 'Quick decision path',
  colWidth: 200,
  rowHeight: 84,
  nodes: [
    { id: 'q1', label: 'Unbounded?', sub: 'could grow forever', col: 0, row: 0, color: 'neutral' },
    { id: 'q2', label: 'Shared or standalone?', sub: 'own lifecycle/pages', col: 1, row: 0, color: 'neutral', w: 170 },
    { id: 'q3', label: 'Read with parent?', col: 2, row: 0, color: 'neutral' },
    { id: 'ref', label: 'Reference', sub: 'own collection', col: 1, row: 1, color: 'mongo' },
    { id: 'emb', label: 'Embed', sub: 'subdocuments', col: 3, row: 0, color: 'mongo' },
  ],
  edges: [
    { from: 'q1', to: 'ref', label: 'yes' },
    { from: 'q1', to: 'q2', label: 'no' },
    { from: 'q2', to: 'ref', label: 'yes' },
    { from: 'q2', to: 'q3', label: 'no' },
    { from: 'q3', to: 'emb', label: 'yes' },
    { from: 'q3', to: 'ref', label: 'no', dashed: true },
  ],
}
```

Taskforge's choices, so you can see the reasoning:

- **Labels → embedded in Issue.** A handful per issue, always shown with the issue, meaningless alone.
- **Issue → Project: reference on the issue** (`issue.project`). A project has *unbounded* issues; you never want a project document holding 10,000 issues.
- **Project → members: array of references on the project.** "Many-to-few": a project has a bounded number of members, users exist independently.
- **Comments → their own collection, referencing the issue.** Unbounded (a heated bug can get 300 comments), loaded separately (on the issue page, not the board).

### Where does the reference live?

For one-to-many, store the reference on the **"many" side**: `comment.issue`, not `issue.comments: [ids]`. An array of ids on the parent has the same unbounded-growth problem as embedding, plus two writes to keep in sync on every new comment. (You'll still be able to *ask* the issue for its comments — that's what virtual populate is for, next lesson.)

> [!TIP] Denormalization is allowed
> Sometimes you copy a little data on purpose: a review stores `byName: "sam"` alongside `byId`, so listing reviews doesn't need a lookup. The price: if sam renames, you must update every copy (or accept stale names). It's a trade-off, not a sin — just make it deliberately and write down which copy is the source of truth.

## Populate

With references, you'll want to "follow" them. Mongoose's `populate` replaces an ObjectId with the referenced document:

```ts
const book = await Book.findOne({ title: 'Kindred' }).populate('author');
book.author.name; // "Octavia E. Butler"
```

It looks like a join. **It isn't.** MongoDB doesn't do anything special — Mongoose runs a **second query** and stitches the results together in JavaScript:

```viz-sequence
{
  actors: [
    { id: 'app', label: 'your code', color: 'neutral' },
    { id: 'm', label: 'Mongoose', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'm', label: "Book.find().populate('author')" },
    { from: 'm', to: 'db', label: 'books.find({})', note: 'Query 1: the books, exactly as stored — `author` is just an ObjectId.' },
    { from: 'db', to: 'm', label: '3 books', ret: true, payload: '[ { title: "Kindred", author: ObjectId("a7") },\n  { title: "Dawn", author: ObjectId("a7") },\n  { title: "Beloved", author: ObjectId("c2") } ]' },
    { from: 'm', to: 'm', label: 'collect unique ids', note: 'Mongoose gathers the distinct `author` ids from **all** results: `a7`, `c2`.' },
    { from: 'm', to: 'db', label: 'authors.find({ _id: { $in: [a7, c2] } })', note: 'Query 2: **one** query for all of them, using `$in`. Not one per book.' },
    { from: 'db', to: 'm', label: '2 authors', ret: true },
    { from: 'm', to: 'app', label: 'books with author objects', ret: true, note: 'Mongoose replaces each id with the matching author document. Two queries total, no matter how many books.' },
  ],
}
```

So `populate` on a list is efficient: one extra query per populated path. The thing to avoid is the version you write by hand in a loop:

```ts
// ✘ N+1 queries: one for books, then one PER book
const books = await Book.find();
for (const b of books) {
  b.authorDoc = await Author.findById(b.author);
}
```

With 50 books, that's 51 round trips. This pattern is called **N+1**, and it's going to come back in a big way in Part II, where GraphQL makes it very easy to write by accident.

> [!BRIDGE]
> `SELECT b.title, a.name FROM books b JOIN authors a ON a.id = b.author_id` is one query, and PostgreSQL does the matching. `populate` is two queries, and the matching happens in Node. `ref` looks like a foreign key too, but nothing enforces it: delete an author and their books keep an id that points at nothing.

### Populate options you'll use

```ts
// only some fields of the referenced doc
Book.find().populate('author', 'name');                 // _id + name

// options object: select, match, sort, limit…
Book.find().populate({ path: 'author', select: 'name -_id' });

// several paths
Book.find().populate('author').populate('editor', 'name');

// nested: populate the reviews' authors too
Book.findById(id).populate({ path: 'reviews', populate: { path: 'user', select: 'name' } });

// arrays of ids populate the same way
Book.findById(id).populate('coauthors', 'name');
```

### When populate gives you `null`

This is where the debugging starts. If the referenced document doesn't exist anymore (deleted author, bad id stored), populate gives you:

- `null` for a single reference — `book.author === null`,
- for an array of references, the missing ones are **silently dropped** — 3 ids in, 2 docs out.

Other things that make populate "not work":

| Symptom | Likely cause |
| --- | --- |
| `MissingSchemaError: Schema hasn't been registered for model "author"` | `ref: 'author'` doesn't match the model name `'Author'` (case matters), or the model file was never imported |
| `Cannot populate path 'autor' because it is not in your schema` | typo in the path (Mongoose's `strictPopulate` catches it — be grateful) |
| field is still an ObjectId | you forgot to `await`, or populated a *different* query than the one you returned |
| `null` | referenced doc doesn't exist, or the stored id doesn't match its `_id` |

And a comparison trap that's not really about populate, but shows up right next to it:

```ts
book.author === author._id;          // ✘ always false — two different ObjectId objects
book.author.equals(author._id);      // ✔ compares the value
String(book.author) === author.id;   // ✔ compare as strings
```

`ObjectId`s are objects; `===` compares identity. When you see "the ids are clearly the same but the check fails", it's this.

## `populate` vs `$lookup`

MongoDB *does* have a real server-side join: the `$lookup` aggregation stage (Module 5). `populate` is usually more convenient (works with your models, casting, select). `$lookup` is better when you need to filter or sort *by* fields of the joined collection, or compute something across both, in one round trip.

```quiz
Q: `Book.find().populate('author')` returns 200 books by 30 different authors. How many queries hit MongoDB?
- [ ] 1
- [x] 2
- [ ] 31
- [ ] 201
> One for the books, then one `$in` query for all 30 distinct author ids. 201 is what a hand-written loop would do.
```

```quiz
Q: A project stores `members: [ObjectId, ObjectId, ObjectId]`. One of those users was deleted. What does `populate('members')` give you?
- [ ] An error: referenced document not found
- [ ] An array with `null` in the deleted user's slot
- [x] An array of the 2 users that still exist
> For arrays of references, missing documents are dropped silently. If counts suddenly don't add up after a populate, check for dangling references.
```
