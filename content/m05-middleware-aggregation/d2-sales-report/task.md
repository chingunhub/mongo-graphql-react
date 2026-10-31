---
title: "Drill: the sales report"
kind: drill
db: true
summary: Aggregation with $unwind, computed fields, distinct counts, a date window and a $lookup.
focus: [reports/sales.ts, models/Order.ts, playground.ts]
readonly: [models/Order.ts, models/Customer.ts]
needs: [m05/l2-aggregation]
---

The finance team wants two numbers on their dashboard, computed in the database (there are millions of orders — fetching them into Node is not an option).

Read `models/Order.ts` first. An order has a `customer` (reference), a `status` (`PAID` or `REFUNDED`), a `createdAt`, and **embedded line items**: `{ sku, category, qty, price }`.

## Your task

In `reports/sales.ts`:

### `revenueByCategory(from, to)`

For **paid** orders created in `[from, to)` (from inclusive, to exclusive), per **item category**:

```ts
[
  { category: 'keyboards', revenue: 534, units: 6, orders: 2 },
  { category: 'cables', revenue: 45, units: 3, orders: 2 },
]
```

- `revenue` — sum of `qty × price` over that category's line items
- `units` — sum of `qty`
- `orders` — number of **distinct orders** containing at least one item of that category (an order with two keyboard lines counts once)
- sorted by `revenue` descending; exactly these four keys, no `_id`

### `topCustomers(limit = 3)`

The customers who spent the most on **paid** orders (all time), with their names from the `customers` collection:

```ts
[
  { customerId: '66f…', name: 'Kai Ito', spent: 579, orders: 2 },
  …
]
```

`customerId` is a **string**. Sorted by `spent` descending.

## Hints

### Unwinding line items
Revenue is per *line item*, so `$unwind: '$items'` after the `$match`. Each output document has one `items` object. Compute with `{ $multiply: ['$items.qty', '$items.price'] }` inside a `$sum`.

### Distinct orders per category
Collect order ids per group with `$addToSet: '$_id'` (the order's `_id` survives `$unwind`), then turn the set into a count in a `$project` with `{ $size: '$orderIds' }`.

### Joining customers
After grouping by `'$customer'` and sorting/limiting, `$lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' }`, then `$unwind: '$customer'`. In `$project`, `{ $toString: '$_id' }` makes the id a string.
