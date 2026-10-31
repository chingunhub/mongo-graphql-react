---
title: "Bug hunt: the wrong bylines"
kind: bughunt
db: true
summary: Someone added DataLoader, and now articles credit the wrong author. Keep the batching, fix the contract.
focus: [loaders.ts, resolvers.ts, playground.ts]
readonly: [models/Author.ts, models/Article.ts, models/Comment.ts, schema.ts, context.ts, server.ts]
needs: [m09/l1-n-plus-one]
---

A newsroom API had the classic N+1 problem. A contractor added DataLoader, the query count dropped, everyone celebrated, and the contractor moved on. Then the corrections started coming in:

> **TICKET-6310 — "Why is my name on that?"** (priority: high)
>
> 1. Articles show a real author, just **not the right one**. It looks random, but it's the same wrong name on every refresh.
> 2. We removed a freelancer's account and **every** author on the page turned into an error.
> 3. As soon as a brand new article with **no comments** goes live, the list stops loading.
> 4. Ops: the list is still slower than it should be. It's not growing with the number of articles any more, but it does grow when editors add more reviewers.

Bugs like these are the reason the last lesson was so strict about what a batch function must return. Your batch function makes a promise to DataLoader, and DataLoader believes you.

Run the playground. It prints the bylines, any errors, and the query count.

## Your task

Don't remove DataLoader, and don't change any response shape.

1. Each article shows its own author.
2. An author that no longer exists shows up as `author: null` on that article only, and is left out of `reviewers`. Every other article is unaffected.
3. An article with no comments has `commentCount: 0`.
4. `{ articles { title author { name } reviewers { name } commentCount } }` runs **3 queries**, however many articles or reviewers there are. Reviewers stay in the order stored on the article.

## Hints

### Symptoms 1 to 3 are the same bug

Write the contract down: for keys `[a, b, c]`, what must the batch function return? Now look at what `find` and `$group` actually give you. What order? How many rows, if a key has nothing?

### Symptom 4

Batching only works when the `load` calls happen together. Read the reviewers resolver slowly: what happens between one `load` and the next?

### Putting it right

Turn the rows into a `Map` keyed by id, then build the result by walking the **keys**, not the rows. For reviewers, `loadMany` asks for everything at once. It gives you `null` for a missing author, and the schema says `[Author!]!`.

### All four

`authorById`: `const byId = new Map(rows.map((a) => [String(a._id), a])); return ids.map((id) => byId.get(id) ?? null);`. `commentCountByArticle` follows the same shape with `?? 0`. `Article.reviewers` calls `loadMany` with all the ids, then filters out the empties.
