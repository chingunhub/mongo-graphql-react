---
title: "Drill: resolve a compound entity"
kind: "drill"
focus: ["stock.ts"]
---

The same SKU can sit in several warehouses, each with its own quantity. So stock has a two-part identity, and the warehouse in a representation is only a claim until you've checked it.

## Your task

### 1. Declare the entity in `stockSchema(rows)`

Build a schema with `buildSubgraphSchema`, as a Federation 2 subgraph:

- `Stock` has key `"warehouse sku"`, with fields `warehouse: ID!`, `sku: ID!` and `quantity: Int!`.
- `Query.ping` stays, and returns `"ok"`.

### 2. Resolve references

The trusted context is `{ warehouse }`. Calling `_entities` under warehouse `n` should give:

| Representation | Result |
| --- | --- |
| `{ __typename: 'Stock', warehouse: 'n', sku: '7' }` with a row | that row's fields |
| the same, but no such row | `null` |
| `{ __typename: 'Stock', warehouse: 's', sku: '7' }` | `null`, even if that row exists |

Don't mutate `rows`. The tests send actual `_entities` queries, so a helper function that only looks correct won't pass.

## Hints

### Where to start
The lesson's `Book` example has every piece, except that its query takes an argument. Which lines are the protocol, and which lines are about books?

### Foreign warehouse
Decide what must be compared with what, and what happens first: the comparison or the search.

### Why ping?
A subgraph needs at least one query field to be a useful schema here. What should yours return?
