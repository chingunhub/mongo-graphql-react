---
title: MongoDB арван минутад
source: 54a25fa778da357461793d11ba64036dbac9611d494aeb839b66f15033d9d6a1
---

Stack-ийн хамгийн доод давхраас эхэлье, учир нь дээр байгаа бүх зүйлийн хэлбэр өгөгдөл яаж хадгалагдаж байгаагаас хамаарна. Өмнө нь SQL хэрэглэж байсан бол эндхийн зарим зүйл танил санагдана. Хэрэглэж үзээгүй бол бүр сайн, мартах зуршил цөөн гэсэн үг.

## Мөр биш, document

MongoDB-д хадгалагдах зүйл бол **document**: JSON шиг харагдах object-ууд. Part I-ийн турш жишээнд ашиглах жижигхэн *Bookshelf* app-ын нэг номыг харъя:

```json title="books collection доторх нэг document"
{
  "_id": ObjectId("66f1c2a9e4b0a1b2c3d4e5f6"),
  "title": "The Left Hand of Darkness",
  "year": 1969,
  "tags": ["scifi", "classic"],
  "author": { "name": "Ursula K. Le Guin", "born": 1929 },
  "addedAt": ISODate("2024-03-02T10:15:00Z")
}
```

Гурван зүйлийг шууд анзаараарай:

1. **Nesting бол хэвийн зүйл.** `author` бол номын *дотор* байгаа бүтэн object. `tags` бол array. SQL дээр нэмэлт table гаргах байсан бол Mongo дээр хамт уншигддаг өгөгдлийг хамт хадгалж болно.
2. **Энэ яг JSON биш, BSON.** "Binary JSON" нь JSON-оос олон төрөлтэй: жинхэнэ огноо (`ISODate`), 32-bit, 64-bit бүхэл тоо, double, мөнгөнд зориулсан `Decimal128`, binary өгөгдөл, мөн `ObjectId`. JSON response дээр `"addedAt": "2024-03-02..."` гэж string байдлаар харвал, энэ нь *API* жинхэнэ Date-ийг serialize хийсэн гэсэн үг.
3. **Document бүр `_id`-тай.** Өөрөө өгөөгүй бол driver үүсгээд өгнө.

Бүтэц нь ийм: document-ууд **collection** дотор, collection-ууд **database** дотор.

```viz-flow
{
  colWidth: 175,
  rowHeight: 80,
  nodes: [
    { id: 'srv', label: 'mongod', sub: '127.0.0.1:27017', col: 0, row: 1, color: 'mongo' },
    { id: 'db', label: 'bookshelf', sub: 'database', col: 1, row: 1, color: 'mongo' },
    { id: 'books', label: 'books', sub: 'collection', col: 2, row: 0, color: 'mongo' },
    { id: 'authors', label: 'authors', sub: 'collection', col: 2, row: 2, color: 'mongo' },
    { id: 'd1', label: '{ title: "Dune" … }', col: 3, row: 0, color: 'neutral', w: 165 },
    { id: 'd2', label: '{ name: "Le Guin" … }', col: 3, row: 2, color: 'neutral', w: 165 },
  ],
  edges: [
    { from: 'srv', to: 'db' },
    { from: 'db', to: 'books' },
    { from: 'db', to: 'authors' },
    { from: 'books', to: 'd1' },
    { from: 'authors', to: 'd2' },
  ],
}
```

SQL-ээс ирж байгаа бол товч харьцуулалт:

| SQL | MongoDB | Тайлбар |
| --- | --- | --- |
| database | database | ижил санаа |
| table | collection | гэхдээ багана албадахгүй |
| row | document | дотроо object, array агуулж болно |
| column | field | document бүрт өөр байж болно |
| primary key | `_id` | үргэлж бий, collection дотроо давтагдахгүй |
| `JOIN` | embedding, `$lookup`, эсвэл Mongoose `populate` | Module 4 бүхэлдээ энэ тухай |

## "Schemaless" гэдэг яагаад урхи вэ

MongoDB-д document дотор ямар field байх нь огт хамаагүй. `{ title: "Dune" }`, `{ titel: "Dune", year: "nineteen sixty-five" }` хоёрыг нэг collection-д хийвэл хоёуланг нь дуртайяа хадгалчихна.

Ийм уян хатан байдал өгөгдөл цаг хугацааны явцад өөрчлөгдөхөд их тустай. Харин bug-ийн хувьд аймшигтай: field-ийн нэрэнд гарсан үсгийн алдаа, эсвэл тооны оронд орсон string database-д чимээгүй хэвтэж байгаад, хожим хаа нэгтээ ямар нэг зүйл эвдрэх хүртэл хэн ч анзаарахгүй. **Mongoose-ийн нөхөж байгаа цоорхой яг энэ**: төрөл, заавал байх field, validation, default утга бүхий schema-г *application* дотроо тавиад, database руу зөвхөн зөв хэлбэртэй document явуулах боломж.

> [!IMPORTANT]
> Schema чинь MongoDB-д биш, Node кодонд. Mongoose model-уудаар *дамжихгүйгээр* database руу бичдэг бүх зүйл (raw driver хэрэглэсэн script, shell дээр суусан багийн анд, app-ын хуучин хувилбар) хог өгөгдөл бичиж чадсан хэвээр. Том codebase дээр "байж боломгүй" өгөгдөл debug хийхдээ үүнийг санаарай.

## ObjectId: зүгээр нэг санамсаргүй string биш

`_id` ихэвчлэн 12 byte-ийн **ObjectId** утга. Дотор нь юу байгааг мэдэж авбал цаашид харах зарим зан төлөв ойлгомжтой болно:

```viz objectid
```

Практикт чухал үр дагаврууд:

- **Үүсгэдэг нь database биш, client (driver).** Тиймээс Mongoose document-ын `_id`-г хадгалахаас *өмнө* мэдэж байгаа, `new Book({...})._id` аль хэдийн утгатай.
- **Эхний 4 byte нь timestamp**, тиймээс `_id`-аар sort хийвэл *ойролцоогоор* оруулсан дарааллаар гарна, хэзээ үүссэнийг нь `id.getTimestamp()`-ээс харж болно. Ойролцоогоор гэдэг нь яг нэг секундэд өөр өөр машин дээр үүссэн id-ууд холилдож болно гэсэн үг. Үүн дээр business logic битгий бариарай, жинхэнэ `createdAt` field хэрэглэ.
- **ObjectId бол string биш.** Raw driver дээр `{ _id: "66f1c2a9e4b0a1b2c3d4e5f6" }` *юу ч* олохгүй, учир нь string хэзээ ч ObjectId-тай тэнцэхгүй. Энд Mongoose аварч өгдөг: schema-г чинь хараад string-ийг ObjectId болгож cast хийчихнэ. Гэхдээ цөөн газар (aggregation pipeline, Module 5) энэ ажиллахгүй, тэр bug хүн бүрийг нэг удаа хазсан байх.
- **String бүр хүчинтэй ObjectId биш.** Шаардлага нь 24 тэмдэгттэй hex. `findById("abc")` бол Mongoose дээр `CastError` throw хийнэ. API чинь client-ээс буруу id хүлээж авах нь гарцаагүй, үүнийг дараа нь шийдье.

## Query: filter ч бас document

Query-г дүрсэлж байгаа зүйл бол **filter document**, харагдах байдал нь олохыг хүссэн document-уудтай адилхан:

```js
// exact match
db.books.find({ year: 1969 })

// operators start with $
db.books.find({ year: { $gte: 1960, $lt: 1970 } })

// reach into nested objects with "dot.notation" (quotes required)
db.books.find({ "author.name": "Ursula K. Le Guin" })

// arrays: matching a single value means "the array contains it"
db.books.find({ tags: "scifi" })
```

Сүүлийнх нь хүмүүсийг гайхшруулдаг: `{ tags: "scifi" }` нь `["scifi", "classic"]`-тай таарч байгаа юм. Mongo-гийн хувьд array field-ийг ганц утгатай харьцуулна гэдэг нь "аль нэг element нь тэнцүү" гэсэн үг. Цаашид энэ байнга таарна (issue дээрх label, project-ийн гишүүд).

Filter query дотор яаж ажилладгийг ерөнхийд нь харъя:

```viz-pipeline
{
  title: 'db.books.find({ tags: "scifi", year: { $lt: 1970 } }).sort({ year: 1 })',
  input: {
    label: 'books',
    docs: [
      { title: 'Dune', year: 1965, tags: ['scifi'] },
      { title: 'Beloved', year: 1987, tags: ['literary'] },
      { title: 'Neuromancer', year: 1984, tags: ['scifi', 'cyberpunk'] },
      { title: 'The Left Hand of Darkness', year: 1969, tags: ['scifi', 'classic'] },
      { title: 'Foundation', year: 1951, tags: ['scifi'] },
    ],
    note: 'Collection-д таван document байна. MongoDB filter-ийн **бүх** нөхцөлийг хангасан document-уудыг л үлдээнэ.',
  },
  stages: [
    {
      label: 'filter',
      code: '{ tags: "scifi", year: { $lt: 1970 } }',
      docs: [
        { title: 'Dune', year: 1965, tags: ['scifi'] },
        { title: 'The Left Hand of Darkness', year: 1969, tags: ['scifi', 'classic'] },
        { title: 'Foundation', year: 1951, tags: ['scifi'] },
      ],
      note: '`Beloved`-д tag нь алга. `Neuromancer`-т tag бий ч `$lt: 1970`-д тэнцэхгүй. Нэг filter доторх нөхцөлүүд бүгд AND-аар холбогдсон.',
    },
    {
      label: 'sort',
      code: '{ year: 1 }',
      docs: [
        { title: 'Foundation', year: 1951, tags: ['scifi'] },
        { title: 'Dune', year: 1965, tags: ['scifi'] },
        { title: 'The Left Hand of Darkness', year: 1969, tags: ['scifi', 'classic'] },
      ],
      note: '`1` = өсөхөөр, `-1` = буурахаар. Sort байхгүй бол MongoDB document-уудыг өөрт нь тохиромжтой дарааллаар буцаана, **үүнд хэзээ ч бүү найд**.',
    },
  ],
}
```

## Index, нэг догол мөрөнд (одоохондоо)

Index байхгүй бол MongoDB query-д хариулахын тулд collection-ы **бүх document**-ыг нэг нэгээр нь шалгаж гарна (үүнийг *collection scan* гэдэг). `year` дээр index байвал sort хийгдсэн B-tree-гээр таарах entry-үүд рүү шууд очих боломжтой. Арван document дээр ялгаа мэдэгдэхгүй, харин арван сая дээр миллисекунд, минутын ялгаа. `_id` дээрх index collection бүрт автоматаар бий. Бусдыг нь Module 2-т зарлая, тэр дундаа **unique** index-уудыг: "ижил email-тэй хоёр user байж болохгүй" гэдгийг хангаж байгаа зүйл нь яг эд.

```quiz
Q: Номын document `tags: ["scifi", "classic"]`-тай. Аль filter нь үүнтэй таарах вэ?
- [ ] `{ tags: ["scifi"] }`
- [x] `{ tags: "classic" }`
- [ ] `{ "tags.scifi": true }`
> Array field-ийг ганц утгатай харьцуулах нь "array энэ утгыг агуулж байна" гэсэн үг. `{ tags: ["scifi"] }` бол *бүхэл array* яг `["scifi"]`-тай тэнцэхийг шаардана.
```

```quiz
Q: Ном байгаа мөртлөө raw MongoDB shell дээр `db.books.find({ _id: "66f1c2a9e4b0a1b2c3d4e5f6" })` яагаад юу ч олохгүй байна вэ?
- [ ] Id хэт урт байна
- [x] Хадгалагдсан `_id` нь ObjectId, харин string хэзээ ч ObjectId-тай тэнцэхгүй
- [ ] Id-аар хайхад заавал `findOne` хэрэгтэй
> BSON төрлүүдийн харьцуулалт хатуу. Mongoose schema-г хараад string-ийг ObjectId болгож cast хийчихдэг учраас энэ асуудал cast алгасдаг код руу орох хүртэл харагдахгүй.
```

## Юуг тогтоож авах вэ

- Document бол BSON: nested, төрөлтэй, тус бүр `_id`-тай.
- MongoDB бүтэц албадахгүй, харин Mongoose **app дотроо** албадна.
- ObjectId-г client үүсгэдэг, эхэндээ timestamp-тай, string биш.
- Filter бол document. Dot notation-оор дотогш нь хүрч болно. Array field-ийг ганц утгатай харьцуулбал "агуулж байна" гэсэн үг.

Дараагийн хичээлд: Mongoose энэ schema-гүй хадгалалтыг яаж дүрэмтэй болгодог тухай.
