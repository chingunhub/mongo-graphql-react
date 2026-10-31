---
title: 'Bug hunt: the client remembers the previous organization'
kind: bughunt
summary: 'Debug a real Apollo Client cache that survives an identity switch.'
focus: ['client.ts']
readonly: ['catalogue.ts']
---

A support ticket came in with a screenshot:

> I switched from North to South, and I'm still seeing North's book. Refreshing the page fixes it. Our network log shows the header is correct on every request, so it can't be auth.

That last sentence is a clue. Think about *which* requests the log shows.

## Your task

Fix `createLibraryClient(tenant, link)` in `client.ts`.

| Requirement | Detail |
| --- | --- |
| Isolation | Each call returns an independent client that shares no cached data with another |
| The link | Use the supplied one |
| Entity identity | Two `Book`s with the same `id` in different libraries are different records, even in one cache |
| Useful caching | The same session must still answer a repeated query from its cache |

Don't mutate an existing client, clear another session's cache, or force every request past the cache. A request-count assertion tells real isolation from a `network-only` workaround.

Once it passes, compare this with the server's DataLoader bug in Module 15. What's the same about them?

## Hints

### Follow the missing request
If the link was never called, no change to the tenant value could affect the answer. So what produced the answer?

### What's shared?
Look at where the current code's cache is created. How many of them exist, however many clients you make?

### Two problems, two fixes
The lesson's table has two rows. Have you dealt with both? The second test case needs one record per library inside a single cache.
