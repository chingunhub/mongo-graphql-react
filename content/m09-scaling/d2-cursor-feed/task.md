---
title: "Drill: a cursor-paginated feed"
kind: drill
db: true
summary: A Relay-style connection with compound cursors, hasNextPage via limit+1, input validation — and stable pages under inserts.
focus: [feed.ts, playground.ts]
readonly: [models/Post.ts, schema.ts, server.ts]
needs: [m09/l2-pagination]
---

A social app's home feed: posts, newest first, infinite scroll. Offset paging is producing duplicate posts whenever someone posts while you scroll (the lesson's exact bug). Replace it with a cursor connection.

`schema.ts` and `server.ts` are done; the `Query.feed` resolver calls your `feedConnection(args)`. You write `feed.ts`.

## Your task

### `encodeCursor(post)` / `decodeCursor(cursor)`
An opaque string encoding **both** `createdAt` and `_id` (base64url of a small JSON is fine). `decodeCursor` returns `{ createdAt: Date, id: ObjectId }`, and throws a `GraphQLError` with code `BAD_USER_INPUT` (message `Invalid cursor`) for anything it can't decode — garbage strings, wrong shapes, invalid ids.

### `feedConnection({ first = 10, after })`
Resolves to:

```ts
{
  edges: [{ cursor, node: post }, …],
  pageInfo: { hasNextPage, endCursor },  // endCursor: last edge's cursor, or null when there are no edges
  totalCount,                             // all posts, regardless of page
}
```

- Order: `createdAt` descending, then `_id` descending.
- `first` must be between **1 and 50**; otherwise throw `BAD_USER_INPUT` (message `first must be between 1 and 50`).
- `after` (optional) — return posts strictly *after* that cursor in the sort order.
- Use the **limit + 1** trick for `hasNextPage`.

Requirements the tests check: paging through posts that share a timestamp shows each exactly once; and a post created **while** someone is paging never causes duplicates on their next page.

## Hints

### The "after" condition
With a descending sort on (createdAt, _id), "after (C, I)" means: `{ $or: [{ createdAt: { $lt: C } }, { createdAt: C, _id: { $lt: I } }] }`.

### Encoding
`Buffer.from(JSON.stringify([post.createdAt.getTime(), String(post._id)])).toString('base64url')`. Decoding is the reverse inside a `try` — validate the parsed shape (`typeof t === 'number'`, `mongoose.isValidObjectId(id)`) before trusting it.

### totalCount
`Post.countDocuments()` — independent of the cursor. Run it in parallel with the page query.
