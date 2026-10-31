---
title: "Drill: playlists with embedded tracks"
kind: drill
db: true
summary: An array of subdocuments with element rules, a collection rule, and add/remove operations.
focus: [models/Playlist.ts, playground.ts]
needs: [m02/l2-subdocuments]
---

A music app stores each playlist as one document with its tracks embedded — playlists are bounded and always read together with their tracks, so embedding is the right call.

## Your task

In `models/Playlist.ts`:

### Schemas

A **track** subdocument (keep its `_id` — you'll need it to remove tracks):

| Field | Rules |
| --- | --- |
| `title` | string, required, trimmed |
| `artist` | string, required, trimmed |
| `seconds` | number, required, at least 1 |

A **playlist**, exported as `Playlist` (model name `'Playlist'`):

| Field | Rules |
| --- | --- |
| `name` | string, required, trimmed |
| `tracks` | array of track subdocuments, **at most 50**. When there are more: `A playlist can hold at most 50 tracks` |

### Functions

- **`addTrack(playlistId, track)`** — appends the track and saves. Resolves to the updated playlist. If the playlist doesn't exist, resolve to `null`. An invalid track (say `seconds: 0`) must **not** be saved — let the error throw.
- **`removeTrack(playlistId, trackId)`** — removes that track by its `_id` and saves. Resolves to the updated playlist (`null` if the playlist doesn't exist).
- **`totalDuration(playlist)`** — a plain function (no database!) that returns the total length as a string `"m:ss"`, e.g. 3 tracks of 200, 185 and 241 seconds → `"10:26"`. An empty playlist is `"0:00"`.

## Hints

### Where each rule goes
Element rules (`required`, `min: 1`) belong in the **track schema**. The "at most 50" rule sees the whole array, so it's a `validate` on the `tracks` path itself: `tracks: { type: [trackSchema], validate: { validator: ..., message: ... } }`.

### Changing the array
Load the playlist with `findById`, then `playlist.tracks.push(track)` or `playlist.tracks.pull(trackId)`, then `await playlist.save()`. Save validates the subdocuments and the array rule.

### Formatting m:ss
`Math.floor(total / 60)` minutes, `total % 60` seconds — and `String(s).padStart(2, '0')` so 6 seconds prints as `06`.
