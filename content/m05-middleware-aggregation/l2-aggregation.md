---
title: The aggregation pipeline
minutes: 18
---

`find` answers "which documents?". The **aggregation pipeline** answers everything else: "how many per status?", "average rating per author?", "top 5 customers by spend, with their names?". It's MongoDB's data-processing engine, and it runs *in the database* — you send a description of the computation, not a loop over fetched documents.

## Documents flow through stages

A pipeline is an array of **stages**. Documents go in the top, each stage transforms the stream, results come out the bottom. Here's "average rating per book, best first" on the Bookshelf `reviews` collection:

```ts
await Review.aggregate([
  { $match: { rating: { $gte: 1 } } },
  { $group: { _id: '$book', avg: { $avg: '$rating' }, reviews: { $sum: 1 } } },
  { $sort: { avg: -1 } },
  { $limit: 2 },
]);
```

```viz-pipeline
{
  title: 'Review.aggregate([...]) — step through it',
  color: 'mongo',
  input: { label: 'reviews', docs: [
    { book: 'kindred', by: 'sam', rating: 5 },
    { book: 'dune', by: 'kai', rating: 3 },
    { book: 'kindred', by: 'mo', rating: 4 },
    { book: 'beloved', by: 'sam', rating: 5 },
    { book: 'dune', by: 'lee', rating: 4 },
    { book: 'dune', by: 'ana', rating: 0 },
  ], note: 'Six review documents. (Book ids shown as names to keep it readable.)' },
  stages: [
    { label: '$match', code: '{ rating: { $gte: 1 } }', docs: [
      { book: 'kindred', by: 'sam', rating: 5 },
      { book: 'dune', by: 'kai', rating: 3 },
      { book: 'kindred', by: 'mo', rating: 4 },
      { book: 'beloved', by: 'sam', rating: 5 },
      { book: 'dune', by: 'lee', rating: 4 },
    ], note: '`$match` is a filter — same syntax as `find`. Put it **first**: fewer documents for every later stage, and it can use indexes (only at the start of the pipeline).' },
    { label: '$group', code: "{ _id: '$book', avg: { $avg: '$rating' }, reviews: { $sum: 1 } }", docs: [
      { _id: 'kindred', avg: 4.5, reviews: 2 },
      { _id: 'dune', avg: 3.5, reviews: 2 },
      { _id: 'beloved', avg: 5, reviews: 1 },
    ], note: '`$group` collapses documents that share the same `_id` expression into one. `"$book"` (with a `$`) means *the value of the field* `book`. Accumulators compute per group: `$avg`, `$sum: 1` counts.' },
    { label: '$sort', code: '{ avg: -1 }', docs: [
      { _id: 'beloved', avg: 5, reviews: 1 },
      { _id: 'kindred', avg: 4.5, reviews: 2 },
      { _id: 'dune', avg: 3.5, reviews: 2 },
    ], note: 'Sort by a field that **didn\'t exist** before `$group` — each stage sees only the previous stage\'s output.' },
    { label: '$limit', code: '2', docs: [
      { _id: 'beloved', avg: 5, reviews: 1 },
      { _id: 'kindred', avg: 4.5, reviews: 2 },
    ], note: 'Top two. The whole computation happened inside MongoDB; only two small documents crossed the network.' },
  ],
}
```

> [!BRIDGE]
> That pipeline is a `GROUP BY` query taken apart into steps:
>
> | SQL | Pipeline |
> | --- | --- |
> | `WHERE rating >= 1` | `$match` before the `$group` |
> | `GROUP BY book` with `AVG(rating)`, `COUNT(*)` | `$group` with `$avg`, `$sum: 1` |
> | `HAVING COUNT(*) > 1` | `$match` after the `$group` |
> | `ORDER BY avg DESC` | `$sort` |
> | `LIMIT 2` | `$limit` |
>
> The real difference is order. SQL clauses have a fixed place in the statement, while stages run in the order you write them, so you can group, filter, then group again.

## The stages you'll use 90% of the time

| Stage | Does | Example |
| --- | --- | --- |
| `$match` | filter (like `find`) | `{ $match: { year: { $gte: 2000 } } }` |
| `$group` | group by `_id`, accumulate | `{ $group: { _id: '$author', books: { $sum: 1 } } }` |
| `$sort`, `$limit`, `$skip` | as in queries | `{ $sort: { books: -1 } }` |
| `$project` | reshape: keep, drop, compute fields | `{ $project: { _id: 0, title: 1, decade: { $subtract: ['$year', { $mod: ['$year', 10] }] } } }` |
| `$addFields` / `$set` | add computed fields, keep the rest | `{ $addFields: { total: { $multiply: ['$qty', '$price'] } } }` |
| `$unwind` | one document per array element | `{ $unwind: '$tags' }` |
| `$lookup` | join another collection | see below |
| `$count` | count the stream | `{ $count: 'n' }` |
| `$facet` | several sub-pipelines on the same input | counts *and* a page in one query |

### Accumulators in `$group`

`$sum` (`$sum: 1` counts; `$sum: '$price'` adds), `$avg`, `$min`, `$max`, `$first`/`$last` (after a `$sort`), `$push` (collect values into an array), `$addToSet` (collect *distinct* values). Grouping by `null` (`_id: null`) puts everything in one group — a grand total.

### `$unwind`: arrays become rows

```viz-pipeline
{
  title: 'Counting books per tag',
  color: 'mongo',
  input: { label: 'books', docs: [
    { title: 'Dune', tags: ['scifi', 'classic'] },
    { title: 'Kindred', tags: ['scifi'] },
  ] },
  stages: [
    { label: '$unwind', code: "'$tags'", docs: [
      { title: 'Dune', tags: 'scifi' },
      { title: 'Dune', tags: 'classic' },
      { title: 'Kindred', tags: 'scifi' },
    ], note: 'Each array element gets its own copy of the document, with the array replaced by that element. (Documents with an empty or missing array disappear — add `preserveNullAndEmptyArrays: true` to keep them.)' },
    { label: '$group', code: "{ _id: '$tags', n: { $sum: 1 } }", docs: [
      { _id: 'scifi', n: 2 },
      { _id: 'classic', n: 1 },
    ], note: 'Now grouping by the unwound value counts per tag.' },
  ],
}
```

Whenever you need to compute *over the elements of an array* — order line items, issue labels — `$unwind` is usually step one.

### `$lookup`: a real join

```ts
await Review.aggregate([
  { $group: { _id: '$book', avg: { $avg: '$rating' } } },
  { $sort: { avg: -1 } },
  { $limit: 3 },
  { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } },
  { $unwind: '$book' },
  { $project: { _id: 0, title: '$book.title', avg: { $round: ['$avg', 1] } } },
]);
// [ { title: 'Beloved', avg: 5 }, { title: 'Kindred', avg: 4.5 }, … ]
```

`$lookup` always produces an **array** (`as: 'book'` → `book: [ {...} ]`), even for one match — hence the `$unwind` right after. `from` is the **collection name** (`books`), not the model name. And notice the order: we grouped and limited *first*, so only 3 lookups happen instead of one per review.

## The traps (read this twice)

Aggregation bypasses most of what Mongoose does for you. The pipeline goes to MongoDB nearly verbatim:

> [!CAUTION] No casting: string ids match nothing
> With `find`, Mongoose casts `{ book: '66f1…' }` to an ObjectId using the schema. **Aggregation doesn't know your schema.** `{ $match: { book: '66f1…' } }` compares a string to ObjectIds and returns `[]` — no error. Cast yourself:
> ```ts
> { $match: { book: new mongoose.Types.ObjectId(bookId) } }
> ```
> This one bug has eaten more debugging hours than any other line in this course. Empty aggregation results + an id in the `$match` → check the type first.

Also:

- Results are **plain objects**: no virtuals, no `id`, no methods, no defaults applied.
- **No middleware** except `aggregate` hooks — your `pre(/^find/)` soft-delete filter does *not* apply. Add the `$match` yourself.
- Field references need the `$`: `'$rating'` is the field; `'rating'` is the literal string "rating".
- Missing groups don't appear. Grouping issues by status gives you nothing for statuses with zero issues — if your UI needs all four columns, fill in the zeros in JavaScript.

```quiz
Q: `Issue.aggregate([{ $match: { project: projectId } }, { $group: { _id: '$status', n: { $sum: 1 } } }])` returns `[]`, but the project definitely has issues. `projectId` comes from a request. Most likely cause?
- [ ] `$group` needs a `$sort` first
- [x] `projectId` is a string; aggregation doesn't cast it to an ObjectId
- [ ] `$sum: 1` should be `$count`
> Wrap it: `new mongoose.Types.ObjectId(projectId)`. `find` would have cast it via the schema; aggregation never does.
```

```quiz
Q: You group orders by `status` to draw a chart with four bars. One status has no orders. How many groups come back?
- [ ] Four, one with count 0
- [x] Three — groups only exist for values that occur
- [ ] An error
> `$group` builds groups from the data it sees. Fill in missing categories with zeros in your code, using your list of possible values (like `STATUSES`).
```
