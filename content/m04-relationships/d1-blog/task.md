---
title: "Drill: a blog with authors and posts"
kind: drill
db: true
summary: populate with select, virtual populate with match and sort, and a count virtual.
focus: [models/Author.ts, models/Post.ts, repositories/blog.ts, playground.ts]
needs: [m04/l1-embed-or-reference, m04/l2-virtuals]
---

A blog has **authors** and **posts**. Each post stores its `author` (a reference). Posts can be drafts or published. Your job: the reading side of the blog.

## Your task

### 1. `models/Post.ts`

Finish the schema: add `author`, a **required reference** to `Author`. (The other fields are there.)

### 2. `models/Author.ts`

Add two virtuals to the author schema:

- **`posts`** — the author's **published** posts only, **newest first** (`publishedAt` descending).
- **`publishedCount`** — the **number** of the author's published posts.

Make sure virtuals show up in `toJSON()` / `toObject()`.

### 3. `repositories/blog.ts`

- **`getPost(id)`** — the post with its `author` populated, but **only the author's `name` and `avatar`** (plus `_id`) — never their `email`. Resolves to `null` for an unknown id.
- **`getAuthorPage(authorId)`** — the author with `posts` and `publishedCount` populated, where each post includes only `title`, `slug` and `publishedAt` (plus `_id`). `null` if unknown.
- **`latestPosts(limit = 5)`** — the latest **published** posts across all authors, newest first, as **plain objects**, each with `author` populated to just `{ _id, name }`.

The lesson showed populate and a counting virtual. This drill adds filtering (`match`) and per-field selection on both sides. Read the lesson's options section again if you need to.

## Hints

### Filtering a virtual populate
Virtual definitions accept `match` and `options` (for `sort`). Published means `published: true`.

### Selecting fields in populate
`populate({ path: 'author', select: 'name avatar' })`. `_id` is included unless you exclude it. For `posts`, `select` works the same way: `'title slug publishedAt'`.

### Plain objects with populate
`.lean()` works together with `.populate()` — the populated field becomes a plain object too.
