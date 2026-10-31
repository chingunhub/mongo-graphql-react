---
title: "Drill: track-аа embed хийсэн playlist-үүд"
summary: Элемент бүрийн дүрэмтэй subdocument-уудын array, бүхэл array-ийн дүрэм, мөн нэмэх, хасах operation-ууд.
source: aa8a11fce276f7dfc1fdb1af8b5c5e2a309b6326e90d79f6a25f78bb72407041
---

Music app playlist бүрийг track-уудаа embed хийсэн нэг document болгож хадгалдаг. Playlist-ийн хэмжээ хязгаартай, track-уудтайгаа үргэлж хамт уншигддаг тул embed хийх нь зөв шийдэл.

## Даалгавар

`models/Playlist.ts`-д:

### Schema-ууд

**Track** subdocument-ийг бич (`_id`-г нь байлга, track хасахад хэрэг болно):

| Field | Дүрэм |
| --- | --- |
| `title` | string, required, trim хийгдсэн |
| `artist` | string, required, trim хийгдсэн |
| `seconds` | number, required, 1-ээс багагүй |

**Playlist**-ийг `Playlist` нэрээр export хий (model-ийн нэр `'Playlist'`):

| Field | Дүрэм |
| --- | --- |
| `name` | string, required, trim хийгдсэн |
| `tracks` | track subdocument-уудын array, **50-аас хэтрэхгүй**. Илүү байвал: `A playlist can hold at most 50 tracks` |

### Function-ууд

- **`addTrack(playlistId, track)`** — track-ийг нэмээд хадгална. Шинэчлэгдсэн playlist-ээр resolve болно, playlist олдохгүй бол `null`. Буруу track (жишээ нь `seconds: 0`) **хадгалагдаж болохгүй**. Error-ыг нь бүү барь, throw хийгдэж байг.
- **`removeTrack(playlistId, trackId)`** — тэр track-ийг `_id`-аар нь хасаад хадгална. Шинэчлэгдсэн playlist-ээр resolve болно (playlist байхгүй бол `null`).
- **`totalDuration(playlist)`** — энгийн function (database байхгүй!). Нийт уртыг `"m:ss"` хэлбэрийн string-ээр буцаана, жишээ нь 200, 185, 241 секундтай 3 track бол `"10:26"`. Хоосон playlist бол `"0:00"`.

## Hints

### Дүрэм бүр хаана орох вэ
Элемент бүрийн дүрэм (`required`, `min: 1`) **track schema**-д хамаарна. "50-аас хэтрэхгүй" дүрэм бүхэл array-г хардаг тул `tracks` path-ийн өөр дээр нь `validate` болгож тавина: `tracks: { type: [trackSchema], validate: { validator: ..., message: ... } }`.

### Array-г өөрчлөх
Playlist-ээ `findById`-аар ачаалаад `playlist.tracks.push(track)` эсвэл `playlist.tracks.pull(trackId)` хий, төгсгөлд нь `await playlist.save()`. Save хийх үед subdocument-ууд болон array-ийн дүрэм хоёулаа validate хийгдэнэ.

### m:ss формат
Минутыг `Math.floor(total / 60)`, секундийг `total % 60`-аар ол. Мөн `String(s).padStart(2, '0')` ашигла, тэгвэл 6 секунд `06` гэж хэвлэгдэнэ.
