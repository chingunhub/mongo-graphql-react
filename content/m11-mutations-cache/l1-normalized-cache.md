---
title: The normalized cache
minutes: 15
---

Almost every confusing Apollo Client bug — "I changed it but the list didn't update", "two components show different values", "why did this refetch?" — is a misunderstanding of one thing: **what the cache actually stores**. So let's look inside it.

## It's a table of objects, not a table of responses

A naive cache would store "query + variables → response". Apollo's `InMemoryCache` instead **normalizes**: it splits responses into individual objects, stores each once, and links them with references. Step through it:

```viz cache
```

That's the whole model:

1. Objects with an identity (`__typename` + `id`, by default) are stored once, under `Typename:id`.
2. Everything that points at them stores a **reference**.
3. Query fields (including their **arguments**) are stored on `ROOT_QUERY`.
4. Writing to an entry updates **every** query that references it.

## Identity: why `id` is not optional

Without an `id` in the selection, Apollo can't normalize the object. It's stored *inside its parent* instead, as an anonymous blob, and nothing else can find it:

```compare
--- with id: normalized
query {
  issue(id: "i1") {
    id
    status
    assignee { id name }
  }
}
// cache: Issue:i1 { status, assignee: → User:u2 }
//        User:u2 { name }
--- without id: embedded
query {
  issue(id: "i1") {
    id
    status
    assignee { name }   # no id!
  }
}
// cache: Issue:i1 { status, assignee: { name: "Grace" } }
// rename Grace elsewhere → this copy stays stale
```

Same for mutations: a mutation result **without `id`** can't be merged into anything. The server did its job, the response came back, and the UI shows the old value. You'll hunt exactly this bug in this module.

> [!TIP]
> Make it a habit: **every object selection includes `id`**. Linters (`@graphql-eslint`) can enforce it in a big codebase.

Types without an `id` field can be configured in the cache:

```ts
new InMemoryCache({
  typePolicies: {
    Product: { keyFields: ['sku'] },      // identified by sku instead of id
    PageInfo: { keyFields: false },        // never normalize: always embedded in its parent
  },
});
```

## Arguments make separate cache fields

```text
ROOT_QUERY:
  project({"key":"TF"})  → Project:p1
  project({"key":"AGC"}) → Project:p2

Project:p1:
  issues({"filter":{"status":null}})   → [Issue:i1, Issue:i2, Issue:i3]
  issues({"filter":{"status":"DONE"}}) → [Issue:i3]
```

Each distinct set of arguments is its own field — that's how switching the status filter back to a previous value is instant (no request; you saw this in the last task). It's also why updating lists is tricky: **which** `issues(...)` lists should a new issue appear in? Apollo doesn't know your filter semantics. Only you do.

## What updates automatically — and what doesn't

| After a mutation that returns… | Automatic? |
| --- | --- |
| an existing object (`id` + changed fields) | ✔ the entry is merged; everything re-renders |
| an existing object **without `id`** | ✘ nothing to merge with |
| fields you didn't select in the mutation | ✘ they keep their old value |
| a **new** object | stored, but ✘ in no list |
| a deletion (just an id) | ✘ lists still reference it |
| a change that moves an item between filtered lists (status TODO → DONE) | the entry updates, but ✘ the `status: TODO` list still contains it |

The rule behind the table: **Apollo updates entities automatically, never list membership.** Adding to, removing from, and moving between lists is always your responsibility. The next lesson covers the three ways to do it.

## Looking inside

In the browser, the Apollo Client Devtools extension shows the cache live. In code (or a test):

```ts
console.log(client.cache.extract());
// { ROOT_QUERY: {...}, 'Project:p1': {...}, 'Issue:i1': {...}, ... }

client.cache.identify({ __typename: 'Issue', id: 'i1' }); // 'Issue:i1'
```

When the UI looks wrong, `extract()` answers "is the cache wrong, or is the component reading the wrong thing?" in one line.

```quiz
Q: The mutation `updateIssue(...) { status }` succeeds, but the list still shows the old status. Most likely cause?
- [x] The selection has no `id`, so the result can't be merged into `Issue:<id>`
- [ ] Mutations never update the cache
- [ ] The list must be refetched after every mutation
> Entities merge automatically — but only when the result can be identified. Add `id` to the mutation's selection.
```

```quiz
Q: After `createIssue`, the new issue doesn't appear in the board's list. Is that a bug in Apollo Client?
- [ ] Yes — it should add new entities to lists
- [x] No — Apollo stores the new entity but can't know which lists it belongs to; you must update or refetch them
- [ ] Yes — the cache should be cleared after mutations
> List membership is application logic (filters, sort order, pagination). Apollo leaves it to you.
```
