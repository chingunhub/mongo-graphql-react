---
title: Resolver-ийн бүтэц, Mongoose-той хамт
source: e2c4e5ac9a5cb735a0abf22e598258af1451977ad3a887887bd636afe1378a66
---

Resolver гэдэг нь "field бүрт нэг function" гэдгийг чи харсан. Одоо үүнийг жинхэнэ Mongoose model-той холбоё. Resolver-ийн ихэнх bug *Mongoose юу өгдөг* ба *GraphQL юу хүлээдэг* хоёрын уулзвар дээр төрдөг. Энэ хичээлийн жишээ бүрийг энэ sandbox доторх library-уудаар шалгасан.

> [!BRIDGE]
> Resolver бол GraphQL дахь Express route handler-тэй хамгийн төстэй зүйл:
>
> ```ts
> // Express: the URL picks a handler, and the handler writes the response
> app.get('/books/:id', async (req, res) => {
>   const book = await Book.findById(req.params.id);
>   if (!book) return res.status(404).json({ error: 'Not found' });
>   res.json(book);
> });
>
> // GraphQL: the query picks the fields, and each resolver returns a value
> const resolvers = {
>   Query: {
>     book: (_parent, args) => Book.findById(args.id),
>   },
> };
> ```
>
> Гурван зуршил өөрчлөгдөнө. `res` байхгүй, учир нь утгаа буцаахад response-ыг Apollo өөрөө бүтээдэг. `req.params`, `req.query`, `req.body` гурав `args` дотор нийлнэ. Мөн Express нэг request-д нэг handler ажиллуулдаг бол GraphQL нэг request дээр field бүрт нэг resolver, нийтдээ олныг нь дуудаж болно.

## Дөрвөн argument

```ts
someField(parent, args, context, info) { … }
```

```viz-flow
{
  colWidth: 200,
  rowHeight: 74,
  nodes: [
    { id: 'parent', label: 'parent', sub: 'parent field-ийн утга', col: 0, row: 0, color: 'gql' },
    { id: 'args', label: 'args', sub: "энэ field-ийн argument-ууд", col: 0, row: 1, color: 'gql' },
    { id: 'ctx', label: 'context', sub: 'request бүрт нэг, хуваалцдаг', col: 0, row: 2, color: 'gql' },
    { id: 'info', label: 'info', sub: 'AST, path, schema', col: 0, row: 3, color: 'neutral' },
    { id: 'r', label: 'resolver', sub: 'утга эсвэл promise буцаана', col: 2, row: 1.5, color: 'forge', w: 190 },
  ],
  edges: [
    { from: 'parent', to: 'r' }, { from: 'args', to: 'r' }, { from: 'ctx', to: 'r' }, { from: 'info', to: 'r', dashed: true },
  ],
  steps: [
    { focus: ['parent', 'parent>r', 'r'], caption: '**parent** — parent field-ийн resolver юу буцаасан бол тэр. `Book.author`-ийн хувьд энэ нь ном. Root field-үүдэд (`Query.*`) ихэвчлэн `undefined`. Үүнийг `(parent) => …` гэлгүй, юу болохоор нь нэрлэ: `(book) => …`.' },
    { focus: ['args', 'args>r', 'r'], caption: '**args** — энэ field-ийн argument-ууд. Validate хийгдэж, зөв төрөл рүү нь хөрвүүлэгдсэн ирнэ: enum нь string, `Int` нь тоо, input object нь энгийн object. Client **илгээгээгүй** argument байхгүй. Харин SDL-ийн default-ууд бөглөгдсөн байна.' },
    { focus: ['ctx', 'ctx>r', 'r'], caption: '**context** — **request бүрт нэг** үүсгээд, тэр request доторх бүх resolver-д дамжуулдаг object. Дотор нь одоогийн user, request бүрийн cache (DataLoader), заримдаа service-үүд байна. Module 8 бүхэлдээ энэ тухай.' },
    { focus: ['info', 'info>r', 'r'], caption: '**info** — field-ийн AST, path, буцаах type ба schema. App кодод ховор хэрэгтэй, library-ууд хэрэглэдэг (жишээ нь ямар дэд field асуугдсаныг харахад).' },
  ],
}
```

Resolver утга **эсвэл promise** буцааж болно, GraphQL үүнийг await хийнэ. Гэхдээ Mongoose + Apollo Server хосод л тохиолддог урхи бий (энэ курсийг бичиж байхдаа бид өөрсдөө яг үүнд орсон):

```ts
Query: {
  book: (_parent, { id }) => Book.findById(id), // ✘ returns a Mongoose Query, not a Promise
},
```

```json
{ "errors": [{ "message": "Query was already executed: Book.findOne({ _id: … })" }] }
```

Mongoose-ийн `Query` бол *thenable*: `.then()` дуудагдахад л ажиллана. Apollo Server-ийн plugin instrumentation resolver-ийн үр дүн дээр `.then()` дуудаж хугацааг нь хэмждэг, GraphQL утгаа авахдаа `.then()`-г дахин дууддаг. Хоёр дахь дуудлага query-г дахин ажиллуулах гэхэд Mongoose үүнийг хориглоно. **GraphQL-д үргэлж жинхэнэ Promise өг:**

```ts
Query: {
  book: async (_parent, { id }) => await Book.findById(id), // ✔ async + await
  books: () => Book.find().exec(),                           // ✔ .exec() returns a Promise
},
```

(`async` гэж зарласан repository function-ууд аль хэдийн аюулгүй: `async` function үргэлж жинхэнэ Promise буцаадаг.)

## Урхи 1: `id` ба `.lean()`

Type дээр `id: ID!` бий, resolver нь lean object буцаана:

```ts
Query: { books: () => Book.find().lean() },
```

```json
{ "errors": [{ "message": "Cannot return null for non-nullable field Book.id." }], "data": null }
```

Default resolver `book.id`-г уншдаг. Энэ бол lean object-д байдаггүй **virtual** (Module 1, Module 4… дахин дахин тааралдана). Засах хоёр арга бий:

- GraphQL-д дамжуулах object-д `.lean()` бүү хэрэглэ, эсвэл
- хоёуланд нь ажилладаг жижиг resolver нэм: `Book: { id: (book) => String(book._id) }`.

Хоёр дахь нь илүү найдвартай. Том codebase-д `Book` type-ын resolver дотроос тэр object арван таван query замын аль нэгээс ирснийг мэдэх аргагүй. Тиймээс type-ын resolver-үүдээ document-д **ч**, энгийн object-д ч ажилладаг байхаар бич.

## Урхи 2: Огноо тоо болж гарна

Mongoose чамд `Date` object өгдөг. Харин schema чинь `createdAt: String!` гэсэн. Date-ийг шууд буцаавал…

```json
{ "createdAt": "1774224000000" }
```

…**1970 оноос хойших миллисекунд, string хэлбэрээр** ирнэ. GraphQL-ийн `String` serializer object-ыг `valueOf()`-оор хөрвүүлдэг, Date-ийн `valueOf()` бол тоо. Алдаа биш тул тэр чигээрээ deploy хийгдэж, дараа нь frontend дээрх огноо бүр "Invalid Date" гэж харагдана. Ил хөрвүүл:

```ts
Book: {
  createdAt: (book) => book.createdAt.toISOString(),
},
```

(Custom `DateTime` scalar үүнийг нэг дор шийддэг. Том codebase-д сайн refactor боловч суралцах үед ил хөрвүүлэлт илүү ойлгомжтой.)

## Урхи 3: reference нь object биш, ObjectId

```ts
// Mongoose: book.author is an ObjectId
// GraphQL:  Book.author is Author!
```

`Book.author` resolver байхгүй бол default resolver ObjectId-г буцаана. Тэгээд GraphQL `name`-г *ObjectId-аас* унших гэж оролдоно: `null` гарч, дараа нь non-null алдаа. Reference field бүрд **холбогдсон document-ыг ачаалдаг** resolver хэрэгтэй:

```ts
Book: {
  author: (book) => Author.findById(book.author).exec(),
},
```

Нарийн нэг тохиолдол бий: root resolver `populate('author')` *хийсэн* бол `book.author` аль хэдийн document болчихсон. Тэр үед `Author.findById(book.author)` ажиллах л болно (Mongoose document-ыг `_id` рүү нь cast хийдэг), гэхдээ дэмий дахин query хийнэ. "Id эсвэл populate хийгдсэн doc" аль алиныг нь хүлээн авдаг helper field resolver-үүдийг зөв байлгана:

```ts
const idOf = (ref) => (ref?._id ?? ref); // ObjectId or populated document → id
```

### Eager уу, lazy юу?

Тэгэхээр *root* resolver бүгдийг populate хийх үү, эсвэл *field* resolver-үүд хэрэгтэй үедээ ачаалах уу?

```compare
--- eager: populate in the root resolver
Query: {
  book: (_, { id }) =>
    Book.findById(id).populate('author').populate('reviews').exec(),
}
// ✔ few, predictable queries
// ✘ loads author + reviews even when the
//   query only asked for { title }
--- lazy: field resolvers
Query: { book: (_, { id }) => Book.findById(id).exec() },
Book: {
  author: (book) => Author.findById(book.author).exec(),
  reviews: (book) => Review.find({ book: book._id }).exec(),
}
// ✔ only loads what the query selected
// ✘ in lists: one query per item (N+1)…
//   until Module 9's DataLoader
```

GraphQL-д хамгийн тохирсон хариулт нь **lazy field resolver + batching** (DataLoader, Module 9): асуугдсан зүйлийг л татаж, тэр нь ч цөөн query-ээр. Taskforge одоо lazy-гаар явж, batching-ийг дараа нэмнэ. Ингэвэл N+1 асуудлыг засахаасаа өмнө query log дээр өөрийн нүдээр *харна*.

## Урхи 4: илгээгээгүй argument

GraphQL "argument орхигдсон" ба "argument ил null" хоёрыг ялгана:

```graphql
updateBook(id: "b1", input: { title: "New" })             # input = { title: "New" }
updateBook(id: "b1", input: { title: "New", year: null })  # input = { title: "New", year: null }
```

Resolver дотор орхигдсон field-үүд **байхгүй** (`undefined`), ил null нь `null` байна. Хэсэгчилсэн update-д яг таарна: "дурдаагүй → хөдөлгөхгүй", "null → цэвэрлэ". Чиний Taskforge repository `undefined` ба `null`-г аль хэдийн ялгадаг. GraphQL layer-ийн ажил бол тэдгээрийг нэгийг нөгөөд нь хувиргахгүй, яг байгаагаар нь дамжуулах. (`input.year || null` бол "илгээгээгүй"-г "цэвэрлэ" болгочихно. Resolver дотор `||`-оос болгоомжил.)

## Enum шууд дамжина

GraphQL enum утга resolver-д string (`'SCIFI'`) хэлбэрээр ирдэг, гарахдаа ч адилхан. Mongoose enum-той яг ижил бичлэгтэй байлга, тэгвэл mapping код огт хэрэггүй. Хэн нэгэн *өөр* дотоод утга хүсвэл татгалз: нэг зүйлд хоёр нэр өгвөл том codebase нэмэлт зардал төлнө.

## Жижиг боловч бүрэн жишээ

```ts title="graphql/resolvers.ts"
import mongoose from 'mongoose';
import { Book } from '../models/Book';
import { Author } from '../models/Author';

const idOf = (ref: any) => ref?._id ?? ref;

export const resolvers = {
  Query: {
    books: (_: unknown, { tag }: { tag?: string }) =>
      Book.find(tag ? { tags: tag } : {}).sort({ year: 1, _id: 1 }).lean().exec(),
    book: async (_: unknown, { id }: { id: string }) =>
      mongoose.isValidObjectId(id) ? await Book.findById(id) : null, // bad ids → null, not a CastError
  },
  Book: {
    id: (book: any) => String(book._id),              // works for lean and documents
    author: (book: any) => Author.findById(idOf(book.author)).exec(),
    createdAt: (book: any) => book.createdAt.toISOString(),
  },
};
```

```quiz
Q: `createdAt: String!` field-д resolver байхгүй, parent нь Mongoose document. Client юу хүлээж авах вэ?
- [ ] ISO огноо, жишээ нь "2026-03-23T00:00:00.000Z"
- [x] Миллисекундийн string, жишээ нь "1774224000000"
- [ ] Алдаа: Date бол String биш
> GraphQL-ийн String serializer object дээр `valueOf()` хэрэглэдэг, Date-ийн valueOf нь timestamp тоо. Resolver дотор `toISOString()`-ээр хөрвүүл (эсвэл custom scalar хэрэглэ).
```

```quiz
Q: `Book.author: Author!`-д resolver байхгүй, ном `author`-оо ObjectId хэлбэрээр хадгалдаг. Query `author { name }` асуулаа. Үр дүн нь?
- [ ] Зохиолчийн нэр: GraphQL ref-ийг өөрөө дагана
- [x] Алдаа: ObjectId-аас `name` null болж гарна, харин энэ field non-null
- [ ] Хоосон object
> GraphQL Mongoose-ийн ref-ийн талаар юу ч мэдэхгүй. Reference field-д document-ыг ачаалдаг resolver хэрэгтэй.
```
