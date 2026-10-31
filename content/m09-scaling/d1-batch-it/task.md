---
title: "Drill: batch it"
kind: drill
db: true
summary: Refactor a working-but-slow API to DataLoader — by-id, counting, and one-to-many loaders.
focus: [loaders.ts, resolvers.ts, context.ts, playground.ts]
readonly: [schema.ts, models/Artist.ts, models/Album.ts, models/Track.ts]
needs: [m09/l1-n-plus-one]
---

A music catalog API **works**. It's also slow: run the playground and look at the query count it prints. Your job is the refactor every growing GraphQL codebase eventually needs — without changing a single response.

## Your task

### `loaders.ts` — `createLoaders()`
Return three DataLoaders:

| Loader | Key | Value |
| --- | --- | --- |
| `artistById` | artist id (string) | the Artist, or `null` if it doesn't exist |
| `trackCountByAlbum` | album id (string) | number of tracks — `0` for albums without any |
| `albumsByArtist` | artist id (string) | that artist's albums, **oldest first** — `[]` for artists without any |

Each batch function must make **one** database call, and return results in the **same order as the keys**. The third one is new: a *one-to-many* loader, where each key maps to an **array**.

### `context.ts` — `createContext()`
Returns `{ loaders: createLoaders() }` — **fresh loaders every call**.

### `resolvers.ts`
Switch `Album.artist`, `Album.trackCount` and `Artist.albums` to the loaders (`ctx.loaders…`). Responses must stay exactly the same.

**Target:** `{ albums { title artist { name } trackCount } }` with any number of albums runs in **3 queries**, and `{ artists { name albums { title } } }` in **2**.

## Hints

### Aligning results
Fetch with `$in`, build a `Map` from id string → value, then `keys.map(k => map.get(k) ?? fallback)`. The fallback is `null`, `0` or `[]` depending on the loader.

### Counting in one go
`Track.aggregate([{ $match: { album: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } } }, { $group: { _id: '$album', n: { $sum: 1 } } }])` — remember aggregation doesn't cast ids for you.

### Grouping for one-to-many
`Album.find({ artist: { $in: keys } }).sort({ year: 1, _id: 1 })`, then push each album into `groups.get(String(album.artist))`. Sorting once in the query keeps every group sorted.
