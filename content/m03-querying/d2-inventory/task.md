---
title: "Drill: inventory without race conditions"
kind: drill
db: true
summary: Atomic $inc, conditional updates that refuse to oversell, $addToSet, and validated $set.
focus: [repositories/inventory.ts, models/Product.ts, playground.ts]
readonly: [models/Product.ts]
needs: [m03/l2-updates]
---

A shop's checkout runs on many servers at once. On launch day, 200 people try to buy the last 5 units of a product in the same second. Your inventory functions must make overselling **impossible** — not "unlikely".

The `Product` model is provided in `models/Product.ts` (`sku`, `name`, `stock` with `min: 0`, `price` with `min: 0`, and lowercase `tags`).

## Your task

In `repositories/inventory.ts`:

- **`restock(sku, qty)`** — adds `qty` to stock **atomically** and resolves to the new stock number, or `null` if no product has that SKU. `qty` must be a positive whole number; otherwise throw an `Error` (don't touch the database).
- **`sell(sku, qty)`** — removes `qty` from stock **only if there's enough**, in a single atomic operation. Resolves to `true` if the sale happened, `false` otherwise (not enough stock, or unknown SKU). With 5 in stock and 10 concurrent `sell(sku, 1)` calls, exactly 5 must succeed and stock must end at 0.
- **`addTag(sku, tag)`** — adds a tag unless it's already there (tags are lowercased by the schema, so `'Sale'` and `'sale'` are the same tag). Resolves to the updated product, or `null`.
- **`setPrice(sku, price)`** — sets the price with an update query and resolves to the **updated** product (or `null`). A negative price must be **rejected** with a ValidationError — the schema has `min: 0`, but remember what update queries do with validators by default.

SKUs are stored uppercase; the model's setter handles that for filters too.

## Hints

### Atomic arithmetic
`findOneAndUpdate({ sku }, { $inc: { stock: qty } }, { returnDocument: 'after' })` reads and writes in one step and gives you the new document (or `null`).

### Never oversell
Put the precondition in the **filter**: `{ sku, stock: { $gte: qty } }`. Then `$inc` by `-qty`. If nothing matched, there wasn't enough stock (or the SKU doesn't exist). `updateOne` tells you via `modifiedCount`. Don't rely on `runValidators` for this — it doesn't check `$inc`.

### Validated $set
Pass `{ runValidators: true, returnDocument: 'after' }` to `findOneAndUpdate`. And `$addToSet` is the operator that skips duplicates.
