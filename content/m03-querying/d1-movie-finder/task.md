---
title: "Drill: the movie finder"
kind: drill
db: true
summary: A search function with optional filters, ranges, safe text search, stable sorting and page metadata.
focus: [repositories/movies.ts, models/Movie.ts, playground.ts]
readonly: [models/Movie.ts]
needs: [m03/l1-queries]
---

The `Movie` model is done (read `models/Movie.ts` — it's provided). Your job is the search function behind a "browse movies" page with a sidebar of filters.

## Your task

Implement `findMovies(options)` in `repositories/movies.ts`. Every option is optional:

| Option | Meaning |
| --- | --- |
| `genre` | movies whose `genres` array contains this genre |
| `minRating` | `rating` at least this |
| `yearFrom`, `yearTo` | `year` within the range, **inclusive**. Either bound may be given alone. |
| `search` | case-insensitive "title contains" — the text is matched **literally** (searching `Mission: Impossible (1996)` must not crash, and `.` must not match any character) |
| `sort` | `'rating'` (highest first), `'year'` (newest first) or `'title'` (A→Z). Default `'rating'`. |
| `page`, `pageSize` | 1-based page number (default `1`) and size (default `10`, **capped at 50**) |

It resolves to:

```ts
{
  items: Movie[];   // plain objects for this page
  total: number;    // how many movies match the filters, across all pages
  page: number;     // the page you returned
  pages: number;    // total pages (0 when nothing matches)
}
```

Paging must be **stable**: if several movies tie on the sort field, walking through the pages must show every movie exactly once.

Options that weren't given must not filter anything. (The lesson explained why `{ genre: undefined }` is a trap.)

## Hints

### Ranges with optional ends
Build the year condition as an object and add `$gte` / `$lte` only for the bounds that exist. Only put `year` into the filter if at least one bound was given.

### Literal search
Escape the input before building the regex: `s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`, then `{ $regex: escaped, $options: 'i' }`.

### Stable pages and the total
Each sort needs `_id` as the final tiebreaker, e.g. `{ rating: -1, _id: 1 }`. Run the page query and `countDocuments(filter)` in parallel with `Promise.all`, and compute `pages` with `Math.ceil(total / pageSize)`.
