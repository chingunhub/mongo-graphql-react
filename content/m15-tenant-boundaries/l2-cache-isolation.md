---
title: "The cache that remembered the wrong organization"
minutes: 20
---

Here's a bug that should bother you a bit. Your query is correct. It filters by tenant. Your logs show nothing wrong. And one customer is reading another customer's record.

How? The dangerous read **never reached the database**. A cache answered instead, so there's no query to look at. Most tenant leaks that survive code review look just like this.

## Reproduce it before you fix it

Two organizations both have a record with local ID 7. Here's a small cache, written by hand so nothing is hidden:

```ts
// @worked-example shared-cache
type Row = { tenant: string; id: number; title: string };

const db: Row[] = [
  { tenant: 'north', id: 7, title: 'North contract' },
  { tenant: 'south', id: 7, title: 'South invoice' },
];

export const reads: string[] = [];

async function fetchRow(tenant: string, id: number) {
  reads.push(tenant);
  return db.find((row) => row.tenant === tenant && row.id === id) ?? null; // perfectly scoped
}

const cache = new Map<number, Row | null>();

export async function load(tenant: string, id: number) {
  if (cache.has(id)) return cache.get(id)!;
  const row = await fetchRow(tenant, id);
  cache.set(id, row);
  return row;
}
```

North calls `load('north', 7)`, and the cache stores North's record. Then South calls `load('south', 7)`. The cache sees the key `7`, and hands back **North's contract**. `reads` contains only `['north']`. The tenant filter was never wrong. It simply never ran.

Predict what happens in this experiment, then run both requests. Change the cache lifetime and run them again.

```viz tenant-cache
{}
```

## A cache key must name everything that changes the answer

The bug above is one sentence: **the key leaves out something the answer depends on**. Once you see that, you see the fix options:

```compare
--- 1. Widen the key
// A cache shared across requests.
const key = JSON.stringify([tenant, id]);
// ✔ north/7 and south/7 are now different entries
// ✘ is that everything? a reader and an admin may see different fields
// ✘ and when does this entry expire?
--- 2. Shrink the lifetime
// One loader per request, created in the context.
function createContext(tenant) {
  return { books: new DataLoader((ids) => fetchRows(tenant, ids)) };
}
// ✔ the tenant and actor are fixed for the loader's whole life
// ✔ nothing to invalidate, it dies with the request
// ✘ no sharing between requests
```

Why `JSON.stringify([tenant, id])` rather than `tenant + ':' + id`? Because a tenant named `a:b` with ID `c` collides with tenant `a` and ID `b:c`. Tenant names look harmless until one isn't.

For request-scoped work, prefer option 2. It's the same reasoning you used for DataLoader in Module 9, with a sharper reason now: a request-local cache is safe because of what it *can't* remember.

| Cache lives for | Key must include | Invalidation |
| --- | --- | --- |
| One request | the record ID | none, it dies with the request |
| The whole process | tenant, permissions, locale, version... | your problem forever |

> [!WARNING] A tenant in the key isn't the whole story
> If a reader and an admin see different fields of the same record, a cache keyed by tenant and ID still leaks across roles. Every input that changes the answer has to be in the key.

```quiz
Q: A global loader filters its database query by the current tenant. Is that enough?
- [ ] Yes, because the query is scoped
- [x] No, a cache hit skips the query entirely
- [ ] Yes, as long as the tenant is in the context
> Query isolation and cache isolation are two different walls. A correct filter can't repair a value that's already cached under an incomplete key.
```

## Order is part of correctness

There's a second way a DataLoader goes quietly wrong. The batch result has to line up with the keys, position by position.

Ask for `[7, 2, 9]`. MongoDB returns `[row2, row7]`, because `$in` makes no promise about order and 9 doesn't exist. Return that array as it is, and DataLoader assigns `row2` to key 7. That puts one person's data under another person's name, and every field looks perfectly valid.

Fetch once, index the rows by ID, then map the original keys:

```compare
--- ✘ Trusts the database's order
const rows = await Book.find({ _id: { $in: ids } }).lean();
return rows;
// ✘ the wrong row for key 7, and nothing for key 9
--- ✔ Answers in the order it was asked
const rows = await Book.find({ _id: { $in: ids } }).lean();
const byId = new Map(rows.map((row) => [String(row._id), row]));
return ids.map((id) => byId.get(String(id)) ?? null);
// ✔ one answer per key, in position
```

Don't "fix" it by querying per key, because that throws away the batching you came for. And don't turn a fetch failure into `null`: a missing record and a broken database are different facts, and only one of them is safe to show as "not found".

## Evidence for this kind of bug

Tenant leaks are hard to debug because nothing crashes. Capture these and you'll find it faster:

- Which tenant was requested?
- How long has this cache or loader lived?
- What exact key did it use?
- **Did a database read happen at all?**

Run two requests one after the other first, then interleave them. And keep this rule in your head: **a test with one tenant can never prove tenant isolation.** You need North and South in the same test, with the same local ID.

While you're at it, don't log tokens or message bodies to chase this. The tenant, the key and the hit or miss are enough.

```quiz
Q: Why does a test need two tenants using the same local ID, instead of two tenants with different IDs?
- [ ] It makes the test faster
- [x] With different IDs, an incomplete cache key would never collide, so the bug can't appear
- [ ] MongoDB requires it
> Different IDs produce different cache keys by luck, and the test goes green while the bug stays. Shared IDs are what force the collision.
```

## What's next

The bug hunt gives you a correct repository and a broken cache owner. Resist the urge to touch the query.

After that, Relaydesk gets its own explicit context and action guards, and every service you build from then on has to pass through them.
