---
title: "Drill: slugs and soft delete"
kind: drill
db: true
summary: A save hook that only runs when needed, query middleware with an escape hatch, and methods/statics.
focus: [models/Article.ts, playground.ts]
readonly: [lib/slugify.ts]
needs: [m05/l1-hooks-methods]
---

A publishing app needs two features on its `Article` model:

- **Slugs.** URLs look like `/articles/why-mongo-indexes-matter`. The slug is derived from the title automatically.
- **Soft delete.** Editors "delete" articles all the time and then ask for them back. Instead of removing documents, mark them with `deletedAt` and hide them everywhere — unless someone explicitly asks to see deleted ones.

A `slugify` helper is provided in `lib/slugify.ts`.

## Your task

In `models/Article.ts` (the fields are already there):

1. **Slug hook.** Before saving, set `slug = slugify(title)` — but **only when the title is new or changed**. Saving after editing only the body must leave the slug alone (links in the wild must keep working).

2. **Hide soft-deleted articles** from `find`, `findOne`, `findById`, `findOneAndUpdate` **and** `countDocuments`: anything with a non-null `deletedAt`.
   - Escape hatch: a query run with the option `withDeleted: true` sees everything: `Article.find().setOptions({ withDeleted: true })`.

3. **Instance methods**:
   - `article.softDelete()` — sets `deletedAt` to now, saves, resolves to the article.
   - `article.restore()` — sets `deletedAt` back to `null`, saves, resolves to the article.

4. **Static**: `Article.findBySlug(slug)` — the (non-deleted) article with that slug, or `null`.

## Hints

### Only when the title changed
Inside a `pre('save')` hook, `this.isModified('title')` is `true` for new documents too. Use a regular `async function () {}` — arrow functions don't get `this`.

### One hook, many operations
`schema.pre(['countDocuments', /^find/], function () { ... })` registers the same query middleware for all of them. Inside, `this` is the Query: read your flag with `this.getOptions().withDeleted`, and add the condition with `this.where({ deletedAt: null })`.

### Methods and statics
`articleSchema.methods.softDelete = async function () { ... }` and `articleSchema.statics.findBySlug = function (slug) { return this.findOne({ slug }); }`. Because `findBySlug` uses `findOne`, your soft-delete hook already applies to it.
