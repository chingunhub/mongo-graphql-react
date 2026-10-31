---
title: "Drill: a Recipe model"
kind: drill
db: true
summary: Your first schema, plus queries that go a step past the Book example.
focus: [models/Recipe.ts, playground.ts]
needs: [m01/l2-schema-model-document, m01/l1-mongodb-in-10]
---

You're building the data layer for a recipe app. Same moves as the Bookshelf example — schema, model, a few query functions — but each function asks for something the example didn't show you.

## Your task

In `models/Recipe.ts`:

### 1. The schema and model

| Field | Rules |
| --- | --- |
| `title` | string, **required**, trimmed |
| `minutes` | number, **required** |
| `tags` | array of strings — **each tag** trimmed and lowercased (`" Vegan "` → `"vegan"`) |
| `vegetarian` | boolean, defaults to `false` |

Add `createdAt`/`updatedAt` timestamps, and export the model as `Recipe` (model name `'Recipe'`).

### 2. `createRecipe(data)`

Creates and returns the saved recipe document.

### 3. `findQuickRecipes(maxMinutes)`

Returns recipes that take **at most** `maxMinutes`:

- sorted by `minutes` ascending, and recipes with the same time sorted by `title` A→Z;
- each result is a **plain object** (not a Mongoose document) with **exactly two keys**: `title` and `minutes` — no `_id`.

### 4. `countVegetarian()`

Resolves to the **number** of vegetarian recipes. Don't load the documents to count them — models have a `countDocuments(filter)` method that asks MongoDB for just the count.

Use the playground to try things; the database is fresh on every run.

## Hints

### Array element options
`[String]` is shorthand for an array of plain strings. To give each *element* options, put an options object inside the array brackets: `[{ type: String, ... }]`.

### Sorting by two keys and "at most"
"At most" is `$lte`. `sort()` accepts an object with several keys; order matters — the first key sorts, the second breaks ties: `{ minutes: 1, title: 1 }`.

### Exactly two keys
`.select()` includes `_id` unless you exclude it. You can mix inclusion with excluding `_id` only: `.select('title minutes -_id')` or `.select({ title: 1, minutes: 1, _id: 0 })`. Then `.lean()` turns documents into plain objects.
