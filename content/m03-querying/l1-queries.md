---
title: "Queries: operators, dynamic filters, paging"
minutes: 18
---

Most backend code that touches a database is some version of "the user picked some filters, a sort and a page — go get the matching rows". In a big codebase, that code usually lives in a **repository** function, and it's where a surprising number of bugs hide: a filter that silently matches nothing, a page that repeats items, a search box that crashes on `(`. This lesson is about writing those functions properly.

> [!BRIDGE]
> If you've written SQL, you already know what these queries do. Only the spelling changes:
>
> | SQL | Mongoose |
> | --- | --- |
> | `WHERE year >= 1960` | `.find({ year: { $gte: 1960 } })` |
> | `WHERE format = 'EBOOK' AND year > 2000` | `.find({ format: 'EBOOK', year: { $gt: 2000 } })` |
> | `SELECT title, year` | `.select('title year')` |
> | `ORDER BY year DESC` | `.sort({ year: -1 })` |
> | `LIMIT 20 OFFSET 40` | `.limit(20).skip(40)` |

## The operator toolkit

You've seen `$gte` and `$lt`. Here's the set you'll actually use, all with Bookshelf examples:

| Operator | Meaning | Example |
| --- | --- | --- |
| `$eq` / `$ne` | equal / not equal | `{ format: { $ne: 'EBOOK' } }` |
| `$gt` `$gte` `$lt` `$lte` | comparisons (numbers, dates, strings) | `{ year: { $gte: 1960, $lt: 1970 } }` |
| `$in` / `$nin` | value is (not) one of a list | `{ format: { $in: ['HARDCOVER', 'PAPERBACK'] } }` |
| `$exists` | field present or not | `{ isbn: { $exists: false } }` |
| `$or` | any of several filters | `{ $or: [{ year: { $lt: 1900 } }, { tags: 'classic' }] }` |
| `$all` | array contains all of these | `{ tags: { $all: ['scifi', 'classic'] } }` |
| `$elemMatch` | one array element matches all conditions | see below |
| `$regex` | pattern match on strings | `{ title: { $regex: 'dune', $options: 'i' } }` |

Conditions at the top level of a filter are ANDed together. You only need `$and` explicitly when you'd otherwise repeat a key — for example, two different `$or` clauses.

### The `$elemMatch` gotcha

Books have an array of review subdocuments. You want books where **sam gave 5 stars**:

```compare
--- looks right, isn't
Book.find({
  'reviews.by': 'sam',
  'reviews.rating': 5,
})
// matches a book where sam gave 1 star
// and someone ELSE gave 5 stars
--- what you meant
Book.find({
  reviews: { $elemMatch: { by: 'sam', rating: 5 } },
})
// both conditions must hold
// for the SAME array element
```

Each dot-path condition on an array is checked against *any* element independently. When several conditions must describe **one** element, use `$elemMatch`.

## Building filters dynamically

A search endpoint gets a bag of optional inputs. The core pattern: **start with the conditions that always apply, then add a key only when its input was actually given.**

```ts title="repositories/books.ts"
interface BookSearch {
  author?: string;
  tag?: string;
  sort?: 'newest' | 'title';
}

export function searchBooks({ author, tag, sort = 'newest' }: BookSearch) {
  const filter: Record<string, unknown> = {};
  if (author) filter.author = author;
  if (tag) filter.tags = tag;

  const order = sort === 'title' ? { title: 1 } : { year: -1 };
  return Book.find(filter).sort(order);
}
```

Why the `if`s? Why not just `Book.find({ author, tag })`? Because of this:

> [!CAUTION] `undefined` in a filter is not ignored
> `Book.find({ author: undefined })` does **not** mean "any author". MongoDB treats it like `null`, which matches documents where `author` is **missing or null**. So a search with no author filter returns… only the books with no author. This bug passes code review constantly because the code *looks* fine.

And when `null` *is* meaningful — "show unassigned issues" — make that a deliberate, separate case from "no filter given". You'll do exactly that in the forge step.

## Text search without getting burned

The obvious "title contains" search:

```ts
filter.title = { $regex: input, $options: 'i' };
```

…breaks the moment someone searches for `C++` (`+` is a regex quantifier — and an unbalanced `(` throws), and lets anyone send a pattern like `(a+)+$` that takes exponential time to evaluate. **User input in a regex must be escaped**:

```ts
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

filter.title = { $regex: escapeRegex(input.trim()), $options: 'i' };
```

Every special character becomes literal. `C++` searches for the text `C++`.

> [!NOTE]
> A case-insensitive "contains" regex can't use an index efficiently — MongoDB scans. That's fine for thousands of documents. For millions, you'd reach for a text index or a search engine (Atlas Search, Elasticsearch). Knowing *when* the simple thing stops working is part of the job.

## Projection: only what you need

```ts
Book.find(filter).select('title year');          // include: title, year (+ _id)
Book.find(filter).select('-reviews -__v');       // exclude: everything but these
Book.find(filter).select({ title: 1, _id: 0 });  // include title, drop _id
```

You can't mix includes and excludes in one projection — except `_id`, which may always be excluded. Projection matters more than it looks: a list page that loads every book's 500 embedded reviews just to show titles is slow in a way that only shows up in production.

## Sorting and paging

Offset paging is `skip` + `limit`:

```ts
const page = 3, pageSize = 20;
Book.find(filter).sort({ year: -1 }).skip((page - 1) * pageSize).limit(pageSize);
```

There's a subtle bug waiting in that sort. Watch what happens when several books share a `year`:

```viz-pipeline
{
  title: 'sort({ year: -1 }) with ties, pages of 2',
  color: 'mongo',
  input: { label: 'books', docs: [
    { title: 'A', year: 1979 }, { title: 'B', year: 1979 }, { title: 'C', year: 1979 }, { title: 'D', year: 1965 },
  ], note: 'Three books from 1979. Their order relative to each other is **undefined** — MongoDB may return them differently on each query.' },
  stages: [
    { label: 'page 1', code: 'skip(0).limit(2)', docs: [{ title: 'B', year: 1979 }, { title: 'A', year: 1979 }], note: 'First request happens to return B, A…' },
    { label: 'page 2', code: 'skip(2).limit(2)', docs: [{ title: 'B', year: 1979 }, { title: 'D', year: 1965 }], note: '…second request orders the ties differently: **B appears twice, C never appears.** Nothing errors. Users just see duplicates and missing items.' },
    { label: 'fix', code: 'sort({ year: -1, _id: -1 })', docs: [{ title: 'C', year: 1979 }, { title: 'B', year: 1979 }, { title: 'A', year: 1979 }, { title: 'D', year: 1965 }], note: 'Add a **unique tiebreaker** as the last sort key. `_id` is unique, so the order is now total and pages are stable.' },
  ],
}
```

**Always end a paginated sort with a unique field.** `_id` is the usual choice.

Offset paging has two other costs you should know about: large `skip`s get slow (the database still walks past every skipped document), and if items are inserted while someone is paging, they'll see shifted results. Module 9 introduces **cursor pagination**, which fixes both. Offset paging is still the right call for "page 3 of 12" UIs on modest data.

### Items and a total, together

Paged UIs usually need the total count too. Two queries, run in parallel:

```ts
const [items, total] = await Promise.all([
  Book.find(filter).sort(order).skip(skip).limit(pageSize).lean(),
  Book.countDocuments(filter),
]);
return { items, total, pages: Math.ceil(total / pageSize) };
```

Note it's the **same `filter`** for both — the count must reflect the filters, not the whole collection. (`estimatedDocumentCount()` is a fast whole-collection estimate from metadata; it ignores filters.)

## A Query is a builder (and when to `exec()`)

`Book.find(filter)` returns a Query object; chained methods modify it; `await` runs it. You can even build it in steps:

```ts
let q = Book.find(filter);
if (onlyTitles) q = q.select('title');
const books = await q.sort({ year: -1 }).limit(10);
```

`await q` works because a Query is *thenable*. `q.exec()` returns a real Promise — use it when you need one (e.g. passing to a function that calls `.finally`) or for nicer stack traces. A Query also **executes once per `await`**: awaiting the same Query object twice throws "Query was already executed".

```quiz
Q: `Issue.find({ project: id, assignee: filter.assigneeId })` is called with `filter = {}`. What comes back?
- [ ] All issues in the project
- [x] Only issues in the project with no assignee
- [ ] An error: assignee is undefined
> `undefined` behaves like `null` in a MongoDB filter, which matches documents where the field is missing or null. Only add `assignee` to the filter when it was actually provided.
```

```quiz
Q: Why add `_id` as the last sort key in a paginated query?
- [ ] It makes the query use an index
- [ ] MongoDB requires `_id` in every sort
- [x] It makes the order total, so documents with equal sort values can't shift between pages
> Without a unique tiebreaker, documents that tie on the sort key can come back in a different order on each query — producing duplicates and gaps across pages.
```
