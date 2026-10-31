---
title: "Drill: request-local booking loader"
kind: "drill"
focus: ["loader.ts"]
---

You met DataLoader in Module 9. This time it has to behave at the edge of a tenant, and the database adapter you've been handed isn't very polite: rows can come back in any order, some IDs can be missing, and a buggy adapter could even return a row from the wrong organization.

## Your task

### 1. `bookingLoader(tenant, fetchBookings)` in `loader.ts`

Create a fresh real `DataLoader` on every call. Each batch calls `fetchBookings(tenant, ids)` exactly once, with this tenant and the unique requested keys.

### 2. Line up the results

A batch must return one entry per key, in key order. Say `b3` doesn't exist:

```ts
const loader = bookingLoader('north', fetchBookings);

await loader.loadMany(['b2', 'b3', 'b1']);
// keys:    b2       b3     b1
// result: [{...b2}, null,  {...b1}]
```

If the adapter returns a row whose `tenant` doesn't match, treat it as if it wasn't there. That's defense in depth: the adapter is supposed to filter, and you don't take its word for it.

### 3. Get the lifetimes right

- Loading the same ID twice in one request hits the cache.
- A second `bookingLoader(...)` for the same tenant fetches again.
- A failing `fetchBookings` rejects the load. An outage must never look like "no such booking".

## Hints

### Shape of the answer
How long must the array you return from the batch function be? Compare that with how many rows the database gave you.

### Don't search per key
A lookup structure built once from the rows is cleaner than searching the array for every key. Which one suits an id-to-row lookup?

### Where does the loader live?
Think about what's created each time `bookingLoader` is called, and what would be created only once if you moved it up a level.

### The outage trap
A `try/catch` around the fetch that returns nulls looks tidy. What would a caller believe then?
