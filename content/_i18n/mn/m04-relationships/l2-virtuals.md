---
title: Virtual ба virtual populate
source: 59fa57d7b4c2709d179aad4ea42c5387b694381c6a12900ab5254351cf177b5d
---

Өмнөх хичээл нэг оньсогоор дууссан. Comment `comment.issue`-г хадгалдаг бол comment id-ийн array хадгалахгүйгээр issue *өөрийнхөө* comment-уудыг яаж авах вэ? Хариулт нь **virtual populate**. Гэхдээ эхлээд энгийн virtual-аас эхэлье.

## Virtual: тооцоологддог property

Virtual бол document дээр байдаг ч **database-д байдаггүй** property. Чи нэгийг нь эхнээсээ хэрэглэж ирсэн: `doc.id` бол `String(doc._id)` буцаадаг virtual.

```ts title="models/Book.ts"
bookSchema.virtual('age').get(function () {
  return new Date().getFullYear() - this.year;
});

bookSchema.virtual('slug').get(function () {
  return this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
});
```

```ts
const book = await Book.findOne({ title: 'Kindred' });
book.age;   // 47 (in 2026)
book.slug;  // "kindred"
```

Virtual-ууд хадгалагддаггүй учраас хийж **чаддаггүй** зүйлс:

- Virtual-аар query ч, sort ч хийж болохгүй: `Book.find({ age: { $gt: 40 } })` юу ч олохгүй.
- `.lean()` object-д байдаггүй (`id` алга болдогтой ижил шалтгаан).
- Чи тохируулаагүй бол `toJSON()` / `toObject()`-д **ордоггүй**:

```ts
const bookSchema = new Schema({ ... }, {
  toJSON: { virtuals: true },   // res.json(book) includes virtuals
  toObject: { virtuals: true }, // console.log / spreads include them
});
```

Ерөнхий дүрэм: *тухайн document-ын өөрийн field-үүдээс* гаргаж авдаг, тооцоолоход хямд утга бол virtual. Filter эсвэл sort хийх зүйлийг жинхэнэ field болгож хадгал. Түүнийг шинэчилж байх ажил Module 5-ын middleware-д ордог.

## Virtual populate: array-гүй "has many"

Оньсого руугаа буцъя. Book өөрийн author-ыг reference хийдэг (`book.author`). Бидэнд `author.books` хэрэгтэй:

```ts title="models/Author.ts"
authorSchema.virtual('books', {
  ref: 'Book',            // which model to query
  localField: '_id',      // value on THIS document…
  foreignField: 'author', // …matched against this field on the OTHER model
});
```

Үүнийг өгүүлбэр болгон унш: *"`books` бол `author` нь миний `_id`-тай тэнцүү `Book`-ууд."* Author дээр юу ч хадгалагдахгүй. Үүнийг populate хийхэд Mongoose урвуу query ажиллуулна:

```viz-sequence
{
  actors: [
    { id: 'app', label: 'чиний код', color: 'neutral' },
    { id: 'm', label: 'Mongoose', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'm', label: "Author.findById(id).populate('books')" },
    { from: 'm', to: 'db', label: 'authors.findOne({ _id })', note: 'Query 1: author.' },
    { from: 'm', to: 'db', label: "books.find({ author: { $in: [authorId] } })", note: 'Query 2: localField-ийн утгууд (`_id`) foreignField-тэй (`author`) тулгагдана. Зохиолчдын *жагсаалт* байвал бүх id нь нэг `$in`-д орно.' },
    { from: 'm', to: 'app', label: 'author.books = [Book, Book…]', ret: true, note: 'Mongoose номуудыг зохиолч тус бүрээр бүлэглээд залгана. Номгүй зохиолч `[]` авна.' },
  ],
}
```

> [!WARNING] Virtual populate-ийн №1 bug
> `localField`, `foreignField`-ийг сольвол error гарахгүй, **хоосон array** ирнэ. `localField` нь чиний populate хийж *эхэлж буй* document-ын field (author: `_id`), `foreignField` нь татаж авч буй document-уудын field (book: `author`). Virtual populate `[]` буцааж байхад өгөгдөл байгаа нь лавтай бол эхлээд эдгээр хоёрыг шалга.

### Option-ууд: sort, filter, тоолох

Virtual populate `options`, `match`, `count`-ийг хүлээн авна. Тодорхойлолт дотор ч, populate хийх үедээ ч өгч болно:

```ts
// define a default order on the virtual
authorSchema.virtual('books', {
  ref: 'Book', localField: '_id', foreignField: 'author',
  options: { sort: { year: -1 } },
});

// or pass them when populating
Author.findById(id).populate({
  path: 'books',
  match: { format: { $ne: 'EBOOK' } }, // only some books
  select: 'title year',
  options: { sort: { year: 1 } },
});

// count instead of loading
authorSchema.virtual('bookCount', {
  ref: 'Book', localField: '_id', foreignField: 'author',
  count: true, // populates a NUMBER
});
await Author.findById(id).populate('bookCount'); // author.bookCount === 7
```

`count: true` document ачаалахын оронд count query ажиллуулдаг тул зөвхөн "7 ном" л хэрэгтэй үед хавьгүй хямд.

> [!WARNING]
> Sort тавих газар хоёр байгаа тул нэгийг нь сонго. Virtual-д default `sort` байвал `populate()`-д дамжуулсан `sort`-ийг дарж, error ч өгөхгүй. Дээрх жишээнд ч хамгийн шинэ нь эхэнд гарсаар байна.

> [!NOTE]
> Populate дээрх `options.limit` эцэг document бүрт биш, **бүх** эцэг document-ыг нийлүүлээд нэг удаа үйлчилнэ. 2 зохиолчийг `{ options: { limit: 1 } }`-ээр populate хийвэл эхний зохиолч 1 ном авч, хоёр дахь нь **0** авна (энэ sandbox-ын Mongoose дээр шалгасан). "Зохиолч бүрийн хамгийн сүүлийн 3 ном" хэрэгтэй бол оронд нь `perDocumentLimit: 3` хэрэглэ (эцэг бүрт нэг query ажиллуулдаг), эсвэл aggregation. Ийм жижиг тайлбар том codebase-д production bug болдгийн сайн жишээ.

## Бүгдийг нэгтгэе

```ts title="models/Author.ts"
const authorSchema = new Schema(
  { name: { type: String, required: true } },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } },
);
authorSchema.virtual('books', {
  ref: 'Book', localField: '_id', foreignField: 'author',
  options: { sort: { year: 1 } },
});
authorSchema.virtual('bookCount', {
  ref: 'Book', localField: '_id', foreignField: 'author', count: true,
});
export const Author = mongoose.model('Author', authorSchema);
```

```ts title="playground.ts"
const author = await Author.findOne({ name: 'Octavia E. Butler' })
  .populate({ path: 'books', select: 'title year' })
  .populate('bookCount');

console.log(author.bookCount);                 // 2
console.log(author.books.map((b) => b.title)); // [ 'Kindred', 'Dawn' ]
console.log(author.toJSON());                  // includes id, books, bookCount
```

## N+1 хэлбэр, дахин нэг удаа

```viz-flow
{
  title: '3 зохиолчийг номын тоотой нь ачаалах',
  colWidth: 190,
  rowHeight: 62,
  nodes: [
    { id: 'a', label: 'find authors', sub: '1 query', col: 0, row: 1, color: 'mongo' },
    { id: 'p', label: "populate('bookCount')", sub: '+1 query ($in)', col: 1, row: 1, color: 'ok', w: 170 },
    { id: 'l1', label: 'countDocuments', sub: 'зохиолч 1', col: 3, row: 0, color: 'bad' },
    { id: 'l2', label: 'countDocuments', sub: 'зохиолч 2', col: 3, row: 1, color: 'bad' },
    { id: 'l3', label: 'countDocuments', sub: 'зохиолч 3', col: 3, row: 2, color: 'bad' },
    { id: 'loop', label: 'for … await', sub: 'loop дотор', col: 2, row: 1, color: 'bad' },
  ],
  edges: [
    { from: 'a', to: 'p', label: 'нийт 2' },
    { from: 'a', to: 'loop', dashed: true },
    { from: 'loop', to: 'l1' },
    { from: 'loop', to: 'l2' },
    { from: 'loop', to: 'l3' },
  ],
  steps: [
    { focus: ['a', 'a>p', 'p'], caption: '**Багцалсан:** populate зохиолч бүрийн id-г цуглуулж, бүгдэд нь зориулсан нэг тоолох query ажиллуулна. 3 зохиолч байсан ч 3,000 байсан ч 2 query.' },
    { focus: ['a', 'a>loop', 'loop', 'loop>l1', 'loop>l2', 'loop>l3', 'l1', 'l2', 'l3'], caption: '**N+1:** элемент бүрт query `await` хийдэг loop. 1 + N query, тус бүр нь сүлжээний round trip. 3 дээр зүгээр, 300 дээр зовлонтой, харин *гэмгүй харагддаг* кодонд нуугдана.' },
  ],
}
```

```quiz
Q: Comment-ууд `comment.post` хадгалдаг. Post дээрх аль virtual `post.comments` өгөх вэ?
- [ ] `{ ref: 'Comment', localField: 'post', foreignField: '_id' }`
- [x] `{ ref: 'Comment', localField: '_id', foreignField: 'post' }`
- [ ] `{ ref: 'Post', localField: '_id', foreignField: 'comments' }`
> "`post` нь миний `_id`-тай тэнцүү comment-ууд": localField Post дээр (`_id`), foreignField Comment дээр (`post`). Сольвол error-гүйгээр хоосон array буцна.
```
