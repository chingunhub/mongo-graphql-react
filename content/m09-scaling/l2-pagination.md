---
title: "Pagination: offsets, cursors and connections"
minutes: 17
---

`issues(limit: 20, offset: 40)` works, and for many screens it's fine. But it has two problems that show up as an app grows, and the GraphQL ecosystem has a standard answer to both. That answer — the **connection** — is what you'll find in most large GraphQL schemas, so it's worth understanding deeply.

## What goes wrong with offsets

**Problem 1: the list moves while you page.** Infinite scroll on a busy board, newest first:

```viz-pipeline
{
  title: 'Offset paging while someone adds an issue',
  color: 'gql',
  input: { label: 'issues, newest first', docs: ['$$TF-9', '$$TF-8', '$$TF-7', '$$TF-6', '$$TF-5', '$$TF-4'] },
  stages: [
    { label: 'page 1', code: 'limit 3, offset 0', docs: ['$$TF-9', '$$TF-8', '$$TF-7'], note: 'You see the first three.' },
    { label: 'someone creates TF-10', docs: ['$$TF-10', '$$TF-9', '$$TF-8', '$$TF-7', '$$TF-6', '$$TF-5', '$$TF-4'], note: 'A new issue lands at the top. Every item shifts down by one position.' },
    { label: 'page 2', code: 'limit 3, offset 3', docs: ['$$TF-7  ← again!', '$$TF-6', '$$TF-5'], note: '"Skip 3" now skips TF-10, TF-9, TF-8 — so **TF-7 shows up twice**. Delete an item instead, and one silently goes missing.' },
  ],
}
```

**Problem 2: big offsets are slow.** `skip(10000)` doesn't jump — the database walks past 10,000 index entries to find the 10,001st. Fine at page 3, painful at page 500.

## Cursors: "after this one", not "skip N"

A cursor says *where you were* in terms of the **sort key**, not a position. "Give me 20 issues created before the one I saw last":

```ts
// sorted by createdAt desc, _id desc (tiebreaker!)
// after the issue with createdAt = C and _id = I:
{
  $or: [
    { createdAt: { $lt: C } },               // strictly older
    { createdAt: C, _id: { $lt: I } },       // same timestamp, smaller id
  ],
}
```

New items at the top don't move "older than C" at all — page 2 is stable. And with an index on the sort keys, the database jumps straight to the cursor's position: page 500 costs the same as page 1.

> [!IMPORTANT] Cursors must include the tiebreaker
> If the cursor only encodes `createdAt`, every item sharing that timestamp is either skipped or repeated (bulk imports create hundreds of identical timestamps). Encode **every** sort key, including the unique tiebreaker — the same rule as stable sorting in Module 3, for the same reason.

### Opaque cursors

Clients shouldn't build or parse cursors — that would freeze your sort implementation into every client. Encode them as opaque strings:

```ts
const encodeCursor = (doc) =>
  Buffer.from(JSON.stringify([doc.createdAt.getTime(), String(doc._id)])).toString('base64url');

function decodeCursor(cursor: string) {
  try {
    const [t, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof t !== 'number' || !mongoose.isValidObjectId(id)) throw new Error();
    return { createdAt: new Date(t), id: new mongoose.Types.ObjectId(id) };
  } catch {
    throw badInput('Invalid cursor'); // a client error, not a server crash
  }
}
```

Opaque doesn't mean secret — anyone can base64-decode it — it means *"don't depend on what's inside"*. Next year you can change the format and old clients won't notice (well, their old cursors will fail gracefully, which is why invalid cursors are `BAD_USER_INPUT`).

## The connection shape

The convention (from Relay, adopted almost everywhere) wraps a page of results like this:

```viz-tree
{
  title: 'project { issueConnection(first: 2, after: "…") { … } }',
  root: {
    label: 'IssueConnection', color: 'gql', id: 'conn',
    children: [
      { label: 'edges: [IssueEdge!]!', id: 'edges', children: [
        { label: '[0] cursor: "WzE3…"', id: 'c0', color: 'neutral' },
        { label: '[0] node: Issue { key: "TF-24" … }', id: 'n0', color: 'neutral' },
        { label: '[1] cursor: "WzE2…"', id: 'c1', color: 'neutral' },
        { label: '[1] node: Issue { key: "TF-23" … }', id: 'n1', color: 'neutral' },
      ]},
      { label: 'pageInfo: PageInfo!', id: 'pi', children: [
        { label: 'hasNextPage: true', id: 'hnp', color: 'neutral' },
        { label: 'endCursor: "WzE2…"', id: 'ec', color: 'neutral' },
      ]},
      { label: 'totalCount: 24', id: 'tc', color: 'neutral' },
    ],
  },
  steps: [
    { focus: ['edges'], caption: '**edges** — one per item. An edge holds the item (`node`) plus that item\'s `cursor`. Wrapping items in edges leaves room for per-relationship data later (e.g. "added to project at").' },
    { focus: ['c0', 'n0', 'c1', 'n1'], caption: 'Each node is a full `Issue` — select whatever fields you want, as usual.' },
    { focus: ['pi', 'hnp', 'ec'], caption: '**pageInfo** — is there more, and where to continue from. To get the next page, pass `endCursor` as `after`.' },
    { focus: ['tc'], caption: '**totalCount** — not part of the core spec, but very common ("24 issues"). It costs a count query, so it\'s only computed if the client selects it… if you write the resolver that way.' },
  ],
}
```

The arguments are conventionally `first` (page size) and `after` (cursor). The client loop is simple:

```graphql-try
query Board($after: String) {
  project(key: "TF") {
    issueConnection(first: 3, after: $after) {
      edges { cursor node { key title } }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
}
---variables---
{ "after": null }
```

Run it, copy `endCursor` into `after`, run again. That's exactly what Apollo Client's `fetchMore` will do for you in Module 12.

### hasNextPage without a second query

Fetch **one more** than asked for:

```ts
const docs = await Issue.find(filter).sort({ createdAt: -1, _id: -1 }).limit(first + 1);
const hasNextPage = docs.length > first;
const page = docs.slice(0, first);
```

If the extra one exists, there's a next page; you just don't return it.

### Guard the page size

`first: 100000` is a denial-of-service request. Validate: `first` between 1 and some maximum (50, say), else `BAD_USER_INPUT`. Every list field that takes a size from a client needs a ceiling.

## Evolving the schema: add, don't replace

Taskforge already has `Project.issues(limit, offset)`, and clients (well, soon) use it. Changing its type to a connection would break them. The professional move is to **add** a field next to it:

```graphql
extend type Project {
  issueConnection(filter: IssueFilter, first: Int = 20, after: String): IssueConnection!
}
```

…and later, once nobody uses the old one, mark it `@deprecated(reason: "Use issueConnection")`. That's why big schemas have pairs of fields that look redundant: they're the fossil record of careful migrations.

```quiz
Q: Issues are sorted by `createdAt` desc. The cursor encodes only `createdAt`. 30 issues were bulk-imported with the same timestamp. What happens when paging with `first: 10`?
- [ ] It works; MongoDB keeps them in insertion order
- [x] Items sharing the cursor's timestamp get skipped (with `$lt`) or repeated (with `$lte`)
- [ ] An error: duplicate cursor
> The cursor can't express a position *inside* a group of equal timestamps. Include the unique tiebreaker (`_id`) in both the sort and the cursor.
```

```quiz
Q: Why fetch `first + 1` documents?
- [x] To know whether `hasNextPage` is true without running a second query
- [ ] To compute totalCount
- [ ] Because cursors are exclusive
> If the extra document exists, there's another page. You return only `first` of them.
```
