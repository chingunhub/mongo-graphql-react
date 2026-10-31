---
title: Aggregation pipeline
source: 1f4da316dfd41c357dda7ff4ba1f6b3e4a5f419e91c04523fcf93e97c55c19fc
---

`find` нь "аль document-ууд вэ?" гэсэн асуултад хариулна. **Aggregation pipeline** бусад бүх асуултад хариулна: "status тус бүрд хэд вэ?", "зохиолч тус бүрийн дундаж rating?", "хамгийн их зарцуулсан 5 customer, нэрсийн хамт?". Энэ бол MongoDB-ийн өгөгдөл боловсруулах хөдөлгүүр, *database дотроо* ажилладаг. Татаж авсан document-уудаар loop хийхгүй, тооцооллын тайлбарыг л явуулна.

## Document-ууд stage-үүдээр дамжина

Pipeline бол **stage**-үүдийн array. Document-ууд дээрээс орж, stage бүр урсгалыг хувиргаад, үр дүн доороос гарна. Bookshelf-ийн `reviews` collection дээр "ном бүрийн дундаж rating, хамгийн сайнаас нь эхлээд" иймэрхүү харагдана:

```ts
await Review.aggregate([
  { $match: { rating: { $gte: 1 } } },
  { $group: { _id: '$book', avg: { $avg: '$rating' }, reviews: { $sum: 1 } } },
  { $sort: { avg: -1 } },
  { $limit: 2 },
]);
```

```viz-pipeline
{
  title: 'Review.aggregate([...]) — алхам алхмаар үз',
  color: 'mongo',
  input: { label: 'reviews', docs: [
    { book: 'kindred', by: 'sam', rating: 5 },
    { book: 'dune', by: 'kai', rating: 3 },
    { book: 'kindred', by: 'mo', rating: 4 },
    { book: 'beloved', by: 'sam', rating: 5 },
    { book: 'dune', by: 'lee', rating: 4 },
    { book: 'dune', by: 'ana', rating: 0 },
  ], note: 'Зургаан review document. (Номын id-г уншихад хялбар байлгахын тулд нэрээр харуулав.)' },
  stages: [
    { label: '$match', code: '{ rating: { $gte: 1 } }', docs: [
      { book: 'kindred', by: 'sam', rating: 5 },
      { book: 'dune', by: 'kai', rating: 3 },
      { book: 'kindred', by: 'mo', rating: 4 },
      { book: 'beloved', by: 'sam', rating: 5 },
      { book: 'dune', by: 'lee', rating: 4 },
    ], note: '`$match` бол filter, `find`-тэй ижил syntax. **Эхэнд** тавь: дараагийн stage бүрд document цөөрнө, мөн index ашиглаж чадна (зөвхөн pipeline-ын эхэнд).' },
    { label: '$group', code: "{ _id: '$book', avg: { $avg: '$rating' }, reviews: { $sum: 1 } }", docs: [
      { _id: 'kindred', avg: 4.5, reviews: 2 },
      { _id: 'dune', avg: 3.5, reviews: 2 },
      { _id: 'beloved', avg: 5, reviews: 1 },
    ], note: '`$group` нь `_id` илэрхийлэл нь ижил document-уудыг нэг болгон нэгтгэнэ. `"$book"` (`$`-тай) нь `book` field-ийн *утга* гэсэн үг. Accumulator-ууд бүлэг тус бүрд тооцоолно: `$avg`, `$sum: 1` тоолно.' },
    { label: '$sort', code: '{ avg: -1 }', docs: [
      { _id: 'beloved', avg: 5, reviews: 1 },
      { _id: 'kindred', avg: 4.5, reviews: 2 },
      { _id: 'dune', avg: 3.5, reviews: 2 },
    ], note: '`$group`-ийн өмнө **байгаагүй** field-ээр sort хийж байна: stage бүр зөвхөн өмнөх stage-ийн гаргасныг л харна.' },
    { label: '$limit', code: '2', docs: [
      { _id: 'beloved', avg: 5, reviews: 1 },
      { _id: 'kindred', avg: 4.5, reviews: 2 },
    ], note: 'Шилдэг хоёр. Бүх тооцоолол MongoDB дотор хийгдэж, сүлжээгээр зөвхөн хоёр жижиг document дамжлаа.' },
  ],
}
```

> [!BRIDGE]
> Тэр pipeline бол `GROUP BY` query-г алхмуудад задалсан хэлбэр:
>
> | SQL | Pipeline |
> | --- | --- |
> | `WHERE rating >= 1` | `$group`-ийн өмнөх `$match` |
> | `GROUP BY book`, `AVG(rating)`, `COUNT(*)` | `$avg`, `$sum: 1`-тэй `$group` |
> | `HAVING COUNT(*) > 1` | `$group`-ийн дараах `$match` |
> | `ORDER BY avg DESC` | `$sort` |
> | `LIMIT 2` | `$limit` |
>
> Жинхэнэ ялгаа нь дараалал. SQL-ийн clause statement дотор тогтсон байрлалтай, харин stage-ууд чиний бичсэн дарааллаар ажилладаг. Тиймээс бүлэглээд, filter хийгээд, дахин бүлэглэж болно.

## 90% тохиолдолд хэрэглэх stage-үүд

| Stage | Хийдэг зүйл | Жишээ |
| --- | --- | --- |
| `$match` | filter (`find`-тэй адил) | `{ $match: { year: { $gte: 2000 } } }` |
| `$group` | `_id`-аар бүлэглэж, accumulate хийнэ | `{ $group: { _id: '$author', books: { $sum: 1 } } }` |
| `$sort`, `$limit`, `$skip` | query дээрхтэй адил | `{ $sort: { books: -1 } }` |
| `$project` | хэлбэр өөрчилнө: field үлдээх, хасах, тооцоолох | `{ $project: { _id: 0, title: 1, decade: { $subtract: ['$year', { $mod: ['$year', 10] }] } } }` |
| `$addFields` / `$set` | тооцоолсон field нэмнэ, бусдыг нь хэвээр үлдээнэ | `{ $addFields: { total: { $multiply: ['$qty', '$price'] } } }` |
| `$unwind` | array-ийн element бүрд нэг document | `{ $unwind: '$tags' }` |
| `$lookup` | өөр collection-тэй join хийнэ | доор харъя |
| `$count` | урсгалыг тоолно | `{ $count: 'n' }` |
| `$facet` | нэг оролт дээр хэд хэдэн дэд pipeline | нэг query-д тоо *болон* нэг хуудас |

### `$group` доторх accumulator-ууд

`$sum` (`$sum: 1` тоолно, `$sum: '$price'` нэмнэ), `$avg`, `$min`, `$max`, `$first`/`$last` (`$sort`-ийн дараа), `$push` (утгуудыг array-д цуглуулна), `$addToSet` (*давхардаагүй* утгуудыг цуглуулна). `null`-аар бүлэглэвэл (`_id: null`) бүгд нэг бүлэгт орно, өөрөөр хэлбэл нийт дүн.

### `$unwind`: array мөр болно

```viz-pipeline
{
  title: 'Tag тус бүрийн номыг тоолох',
  color: 'mongo',
  input: { label: 'books', docs: [
    { title: 'Dune', tags: ['scifi', 'classic'] },
    { title: 'Kindred', tags: ['scifi'] },
  ] },
  stages: [
    { label: '$unwind', code: "'$tags'", docs: [
      { title: 'Dune', tags: 'scifi' },
      { title: 'Dune', tags: 'classic' },
      { title: 'Kindred', tags: 'scifi' },
    ], note: 'Array-ийн element бүр document-ын өөрийн хуулбарыг авч, array-ийн оронд тэр element орно. (Хоосон эсвэл байхгүй array-тай document-ууд алга болно. Хадгалъя гэвэл `preserveNullAndEmptyArrays: true` нэм.)' },
    { label: '$group', code: "{ _id: '$tags', n: { $sum: 1 } }", docs: [
      { _id: 'scifi', n: 2 },
      { _id: 'classic', n: 1 },
    ], note: 'Одоо unwind хийсэн утгаар бүлэглэвэл tag тус бүрийг тоолно.' },
  ],
}
```

*Array-ийн element дээр* тооцоолол хийх бүрд (order-ийн line item, issue-ийн label) `$unwind` ихэвчлэн эхний алхам байдаг.

### `$lookup`: жинхэнэ join

```ts
await Review.aggregate([
  { $group: { _id: '$book', avg: { $avg: '$rating' } } },
  { $sort: { avg: -1 } },
  { $limit: 3 },
  { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } },
  { $unwind: '$book' },
  { $project: { _id: 0, title: '$book.title', avg: { $round: ['$avg', 1] } } },
]);
// [ { title: 'Beloved', avg: 5 }, { title: 'Kindred', avg: 4.5 }, … ]
```

`$lookup` нэг л таарсан ч үргэлж **array** гаргана (`as: 'book'` → `book: [ {...} ]`), тиймээс шууд дараа нь `$unwind` орсон. `from` нь model-ийн нэр биш, **collection-ы нэр** (`books`). Дарааллыг бас анзаараарай: бид *эхлээд* бүлэглэж, limit хийсэн тул review болгонд биш, ердөө 3 lookup хийгдэнэ.

## Урхинууд (хоёр удаа унш)

Aggregation дээр Mongoose чиний өмнөөс хийдэг зүйлсийн ихэнх нь ажиллахгүй. Pipeline MongoDB руу бараг бичсэнээрээ очно:

> [!CAUTION] Casting байхгүй: string id юутай ч таарахгүй
> `find` дээр Mongoose `{ book: '66f1…' }`-г schema-аар ObjectId болгож cast хийдэг. **Aggregation чиний schema-г мэдэхгүй.** `{ $match: { book: '66f1…' } }` string-ийг ObjectId-тай харьцуулаад, error өгөхгүйгээр `[]` буцаана. Өөрөө cast хий:
> ```ts
> { $match: { book: new mongoose.Types.ObjectId(bookId) } }
> ```
> Энэ ганц bug курсийн өөр ямар ч мөрөөс илүү debug хийх цаг идсэн. Aggregation хоосон гарч, `$match` дотор id байвал эхлээд төрлийг шалга.

Бас:

- Үр дүн нь **энгийн object**: virtual, `id`, method байхгүй, default ч үйлчлэхгүй.
- `aggregate` hook-оос өөр **middleware ажиллахгүй**: чиний `pre(/^find/)` soft-delete filter *үйлчлэхгүй*. `$match`-ийг өөрөө нэм.
- Field-ийн reference-д `$` хэрэгтэй: `'$rating'` бол field, `'rating'` бол "rating" гэсэн literal string.
- Хоосон бүлэг гарахгүй. Issue-г status-аар бүлэглэхэд тэг issue-тэй status-ийн мөр гарахгүй. UI-д дөрвөн багана бүгд хэрэгтэй бол тэгүүдийг JavaScript дээр нөх.

```quiz
Q: `Issue.aggregate([{ $match: { project: projectId } }, { $group: { _id: '$status', n: { $sum: 1 } } }])` `[]` буцаалаа, гэтэл project-д issue байгаа нь гарцаагүй. `projectId` request-ээс ирдэг. Хамгийн магадлалтай шалтгаан юу вэ?
- [ ] `$group`-ийн өмнө `$sort` хэрэгтэй
- [x] `projectId` нь string, aggregation үүнийг ObjectId болгож cast хийдэггүй
- [ ] `$sum: 1`-ийг `$count` болгох хэрэгтэй
> Ороо: `new mongoose.Types.ObjectId(projectId)`. `find` үүнийг schema-аар cast хийх байсан, aggregation хэзээ ч хийдэггүй.
```

```quiz
Q: Дөрвөн баганатай chart зурахын тулд order-уудыг `status`-аар бүлэглэв. Нэг status-д order байхгүй. Хэдэн бүлэг буцах вэ?
- [ ] Дөрөв, нэг нь тоо 0-тэй
- [x] Гурав — бүлэг зөвхөн тохиолдсон утгад үүснэ
- [ ] Алдаа
> `$group` бүлгүүдийг өөрийн харсан өгөгдлөөс бүтээнэ. Дутуу category-г өөрийн кодод, боломжит утгуудын жагсаалтаар (`STATUSES` шиг) тэгээр нөх.
```
