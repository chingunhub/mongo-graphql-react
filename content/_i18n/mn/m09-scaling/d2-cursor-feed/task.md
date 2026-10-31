---
title: "Drill: cursor-оор хуудаслах feed"
summary: Relay хэв маягийн connection — нийлмэл cursor, limit+1-ээр hasNextPage, оролтын шалгалт, мөн insert-үүдийн дор тогтвортой хуудас.
source: ef350094f99403472829783a09684cf3789993c56dd159bb15c030732b7ab616
---

Social app-ын нүүр feed: post-ууд хамгийн шинэ нь эхэнд, infinite scroll-той. Offset paging одоо хэн нэгэн чамайг scroll хийж байхад post бичих бүрт давхардсан post гаргаж байна (хичээлд үзсэн яг тэр bug). Үүнийг cursor connection-оор соль.

`schema.ts` ба `server.ts` бэлэн; `Query.feed` resolver чиний `feedConnection(args)`-г дуудна. `feed.ts`-г чи бичнэ.

## Даалгавар

### `encodeCursor(post)` / `decodeCursor(cursor)`
**`createdAt`-ийг ч, `_id`-г ч** хамт кодлох opaque string (жижиг JSON-ийн base64url тохирно). `decodeCursor` буцаах утга нь `{ createdAt: Date, id: ObjectId }`. Задалж чадахгүй зүйл бүрт — хог мөр, буруу хэлбэр, буруу id — `BAD_USER_INPUT` кодтой, `Invalid cursor` message-тэй `GraphQLError` throw хийнэ.

### `feedConnection({ first = 10, after })`
Resolve хийхэд гарах утга:

```ts
{
  edges: [{ cursor, node: post }, …],
  pageInfo: { hasNextPage, endCursor },  // endCursor: last edge's cursor, or null when there are no edges
  totalCount,                             // all posts, regardless of page
}
```

- Эрэмбэ: `createdAt` буурахаар, дараа нь `_id` буурахаар.
- `first` нь **1-ээс 50** хооронд байх шаардлагатай; бусад тохиолдолд `BAD_USER_INPUT` throw хийх ёстой, message нь `first must be between 1 and 50`.
- `after` (заавал биш) — sort-ийн дарааллаар тэр cursor-ын **яг дараа** байгаа post-уудыг буцаа.
- `hasNextPage`-д **limit + 1** арга хэрэглэ.

Тестүүд хоёр зүйл шалгана. Нэгт, ижил timestamp-тай post-уудаар pagination хийхэд тус бүр **яг нэг удаа** гарна. Хоёрт, хэн нэгэн хуудаслаж **байхад** үүссэн post түүний дараагийн хуудсанд хэзээ ч давхардал үүсгэхгүй.

## Hints

### "after" нөхцөл
Sort нь (createdAt, _id) дээр буурах үед "after (C, I)" гэдэг нь: `{ $or: [{ createdAt: { $lt: C } }, { createdAt: C, _id: { $lt: I } }] }` гэсэн үг.

### Кодлох
`Buffer.from(JSON.stringify([post.createdAt.getTime(), String(post._id)])).toString('base64url')`. Декодлох нь яг эсрэгээрээ, `try` дотор хийгдэнэ. Задалсан хэлбэрт итгэхээсээ өмнө (`typeof t === 'number'`, `mongoose.isValidObjectId(id)`) шалга.

### totalCount
`Post.countDocuments()` — cursor-оос хамаарахгүй. Үүнийг page query-тэй **зэрэг** ажиллуул.
