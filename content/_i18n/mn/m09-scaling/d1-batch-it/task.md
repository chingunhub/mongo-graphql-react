---
title: "Drill: batch хийх"
summary: Ажиллаж байгаа ч удаан API-г DataLoader рүү refactor хий — by-id, тоолох ба one-to-many loader-үүд.
source: 9839fbd04c08f5c0ab99dae6ada42cdfdc8ffe2675079c1c7a393ead6902a707
---

Music catalog API **ажилладаг**. Харин удаан: playground-оо ажиллуулаад түүний гаргадаг query-ийн тоог хар. Чиний ажил refactor хийх. Өсөж буй GraphQL codebase бүр эцэстээ үүнийг хийх хэрэгтэй болдог. Нэг ч response өөрчлөгдөх ёсгүй.

## Даалгавар

### `loaders.ts` — `createLoaders()`
Гурван DataLoader буцаа:

| Loader | Key | Утга |
| --- | --- | --- |
| `artistById` | artist id (string) | Artist, эсвэл байхгүй бол `null` |
| `trackCountByAlbum` | album id (string) | track-ийн тоо — track байхгүй album-д `0` |
| `albumsByArtist` | artist id (string) | тэр artist-ын album-ууд, **хамгийн эртнээс нь эхлээд** — album байхгүй artist-д `[]` |

Batch function бүр database руу **яг нэг** дуудалт хийж, үр дүнгээ key-тэй **яг ижил дарааллаар** буцаана. Гурав дахь нь шинэ төрөл: *one-to-many* loader. Үүнд key бүр **array**-д харгалзана.

### `context.ts` — `createContext()`
`{ loaders: createLoaders() }` буцаана — **дуудалт бүрт шинэ loader-үүд**.

### `resolvers.ts`
`Album.artist`, `Album.trackCount` ба `Artist.albums`-ийг loader-үүд рүү шилжүүл (`ctx.loaders…`). Response-ууд яг адилхан хэвээр үлдэх шаардлагатай.

**Зорилт:** `{ albums { title artist { name } trackCount } }` нь ямар ч тооны album-тай байсан **3 query**-гээр ажиллана, `{ artists { name albums { title } } }` нь **2**-оор.

## Hints

### Үр дүнг тохируулах
`$in`-ээр татаад, id string → утга гэсэн `Map` бүтээ, дараа нь `keys.map(k => map.get(k) ?? fallback)`. Fallback нь loader-ээс хамааран `null`, `0` эсвэл `[]` байна.

### Нэг дор тоолох
`Track.aggregate([{ $match: { album: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } } }, { $group: { _id: '$album', n: { $sum: 1 } } }])` — битгий март, aggregation id-г өөрөө cast хийдэггүй.

### One-to-many-д бүлэглэх
`Album.find({ artist: { $in: keys } }).sort({ year: 1, _id: 1 })`-ээр татаад, album бүрийг `groups.get(String(album.artist))`-д push хий. Query дээр нэг удаа sort хийснээр бүлэг бүр эрэмбэтэй хэвээр байна.
