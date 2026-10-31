---
title: "Schema → Model → Document"
source: 642e1d0bb93606e51675436cb2ac12229bb2b48cb73b9391a8af76fbbc1cadf6
---

Mongoose-ийн цөм нь гурван ойлголт, харин Mongoose дээр андуурах тохиолдол бараг бүхэн эдгээрийг хольсноос болдог. Тиймээс гурвыг нь эхлээд сайн ялгаж авъя.

```viz-flow
{
  colWidth: 215,
  nodes: [
    { id: 's', label: 'Schema', sub: 'дүрэм', col: 0, row: 0, color: 'mongo' },
    { id: 'm', label: 'Model', sub: 'Book — class', col: 1, row: 0, color: 'mongo' },
    { id: 'd', label: 'Document', sub: 'нэг ном', col: 2, row: 0, color: 'mongo' },
    { id: 'c', label: 'books collection', sub: 'MongoDB дотор', col: 1, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 's', to: 'm', label: 'mongoose.model()' },
    { from: 'm', to: 'd', label: 'new / find' },
    { from: 'm', to: 'c', label: 'харилцана', dashed: true },
  ],
  steps: [
    { focus: ['s'], caption: '**Schema** нь хэлбэр, дүрмийг дүрсэлнэ: field-ийн төрөл, заавал байх field, default, validator. Өөрөө юу ч хийхгүй, зүгээр л зураг төсөл.' },
    { focus: ['s>m', 'm'], caption: '**Model** бол schema-аас compile хийсэн, collection-д холбогдсон class. `Book.find()`, `Book.create()` шиг static method-ууд энд байна.' },
    { focus: ['m>c', 'c'], caption: 'Model өөрийн collection-ийг мэднэ: `Book` → `books` (жижиг үсэг, олон тоо). Чиний бичсэн query бүр түүгээр дамжина.' },
    { focus: ['m>d', 'd'], caption: '**Document** бол model-ийн *instance*, өөрөөр хэлбэл нэг ном. Чиний field-үүдээс гадна `save()`, change tracking, getter, `id` шиг virtual зэрэг нэмэлт чадвартай.' },
  ],
}
```

## Schema

```ts title="models/Book.ts" {3-8,10}
import mongoose, { Schema } from 'mongoose';

const bookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    year: Number,
    tags: [String],
    author: { type: String, required: true },
  },
  { timestamps: true },
);

export const Book = mongoose.model('Book', bookSchema);
```

Field бүрийг **товч хэлбэр**ээр (`year: Number`) эсвэл **options object**-оор (`{ type: String, required: true, trim: true }`) зарлана. Дүрэм байхгүй үед товч хэлбэрийг хэрэглэ, дүрэм хэрэгтэй болмогц object хэлбэр рүү шилжүүл.

`[String]` нь "string-ийн array" гэсэн үг. Array-д хоосон default (`[]`) автоматаар өгөгдөх тул tag-гүй ном `undefined` биш, `tags: []` болно.

`{ timestamps: true }` нь `createdAt`, `updatedAt`-ийг нэмж, байнга шинэчилнэ. Энэ бол хоёр дахь argument буюу **schema options**, field биш. Бараг model бүр дээр хэрэг болно, учир нь "сүүлд юу өөрчлөгдсөн бэ?" гэсэн асуулт жинхэнэ app бүрт гарч ирдэг.

Зарим option утгыг орж ирэхэд нь хувиргадаг. Эдгээрийг **setter** гэнэ:

| Option | `String` дээр | Жишээ |
| --- | --- | --- |
| `trim: true` | хоёр захын зайг авна | `"  Dune "` → `"Dune"` |
| `lowercase: true` | жижиг үсэг болгоно | `"Ada@Mail.COM"` → `"ada@mail.com"` |
| `uppercase: true` | том үсэг болгоно | `"tf"` → `"TF"` |

Нэг сайхан нюанс: setter **query filter** дээр ч ажилладаг. `email: { type: String, lowercase: true }` байхад `User.findOne({ email: "ADA@MAIL.COM" })` нь жижиг үсгээр бичсэн хувилбарыг хайна, учир нь Mongoose filter-ийг явуулахаасаа өмнө schema-аар cast хийдэг.

## Model

`mongoose.model('Book', bookSchema)` нь schema-г class болгон compile хийж, `'Book'` нэрээр бүртгэнэ. Энэ нэр хоёр газар чухал:

- **collection-ы нэр** үүнээс гарна: `'Book'` → `books`, `'Person'` → `people` (тийм ээ, зарим ердийн бус олон тоог мэднэ), `'Category'` → `categories`;
- model хоорондын **reference** үүнийг ашиглана, Module 4-д `ref: 'Book'` гэж бичнэ.

> [!WARNING]
> Нэг model нэрийг хоёр удаа бүртгэвэл `OverwriteModelError` throw хийнэ. Hot reload-той үед, эсвэл нэг файл хоёр өөр замаар import хийгдэхэд үүнтэй тулгардаг. Model бүрийг өөрийн файлд нэг л удаа зарлаад, бусад газартаа import хий.

### Холболт

Жинхэнэ app-д `mongoose.connect(uri)`-г startup дээр **нэг удаа** дуудна. Model ашиглахын өмнө холболтыг хүлээх албагүй: Mongoose холболт бэлэн болтол command-уудыг **buffer** хийж, дараа нь flush хийдэг.

```viz-sequence
{
  actors: [
    { id: 'app', label: 'чиний код', color: 'neutral' },
    { id: 'm', label: 'Mongoose', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'm', label: 'mongoose.connect(uri)', note: 'Арын горимд холбогдож эхэлнэ, promise буцаана.' },
    { from: 'app', to: 'm', label: 'Book.find()', note: 'Холбогдоогүй байна. Mongoose алдаа өгөхийн оронд command-ыг **buffer** хийнэ.' },
    { from: 'm', to: 'db', label: 'handshake', note: 'Холболт тогтлоо…' },
    { from: 'm', to: 'db', label: 'find books', note: '…тэгээд buffer хийсэн command-ууд дарааллаараа flush хийгдэнэ.' },
    { from: 'db', to: 'm', label: 'document-ууд', ret: true },
    { from: 'm', to: 'app', label: 'Book[]', ret: true, note: 'Чиний `await` дуусна. Холболт хэзээ ч амжилттай болохгүй бол buffer хийсэн command-ууд 10 секундийн дараа "buffering timed out" алдаагаар унана. Ийм алдаа гарвал ихэвчлэн URI буруу, эсвэл DB унтарсан байдаг.' },
  ],
}
```

Энэ курсийн sandbox-д код чинь ажиллахаас өмнө **холболтыг бид хийж өгнө**, шинэхэн database руу. Тиймээс даалгаврын код зөвхөн model зарлаад хэрэглэхэд хангалттай. Startup кодыг эцсийн даалгаварт өөрөө бичнэ.

## Document: үүсгэх ба хадгалах

Оруулах хоёр арга бий:

```ts
// 1. build, then save
const book = new Book({ title: 'Dune', author: 'Frank Herbert', year: 1965 });
console.log(book._id); // already set — the driver generated it
await book.save();

// 2. create = new + save in one call
const book2 = await Book.create({ title: 'Kindred', author: 'Octavia E. Butler', year: 1979 });
```

Дотроо `create` яг юу хийдгийг харъя:

```viz-sequence
{
  actors: [
    { id: 'app', label: 'чиний код', color: 'neutral' },
    { id: 'doc', label: 'Document', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'doc', label: "create({ year: '1965', … })", note: 'Чиний энгийн object-оос шинэ Document үүснэ.' },
    { from: 'doc', to: 'doc', label: 'cast', note: '**Casting**: утга бүр schema-н төрөл рүү хувирна. `"1965"` нь `1965` болно. Schema-д байхгүй field-үүд **хаягдана** (strict mode). Number-д өгсөн `"abc"` бол CastError.', payload: "{ title: 'Dune', year: 1965 }   // year was the string '1965'", lang: 'ts' },
    { from: 'doc', to: 'doc', label: 'setters + defaults', note: '`trim`, `lowercase` зэрэг ажиллана. `default`-той field дутуу бол default-оо авна. Array-ууд `[]` болж, timestamp-ууд тавигдана.' },
    { from: 'doc', to: 'doc', label: 'validate', note: '**Validation**: `required`, `min`, `enum`… Аль нэг нь бүтэлгүйтвэл `ValidationError` ирж, **юу ч бичигдэхгүй**. (Module 2 энд гүн орно.)' },
    { from: 'doc', to: 'db', label: 'insertOne', note: 'Database-д хүрэх нь зөвхөн одоо.' },
    { from: 'db', to: 'doc', label: 'ack', ret: true },
    { from: 'doc', to: 'app', label: 'Document', ret: true, note: 'Document буцаж ирнэ: `_id`, `createdAt`, `__v`-тэй. (`__v` бол Mongoose дотроо хэрэглэдэг version key, тоомсорлох хэрэггүй.)' },
  ],
}
```

> [!CAUTION]
> **Strict mode schema-д байхгүй field-ийг чимээгүй хаядаг.** `Book.create({ title: 'Dune', autor: 'Herbert' })` дээрх үсгийн алдааг хар. `author` заавал байх field тул validation унана. Харин `author` заавал биш байсан бол error ч гарахгүй, үсгийн алдаатай field чимээгүй алга болно, чи author яагаад хэзээ ч хадгалагдахгүй байгааг гайхаж суух байсан. Өгөгдөл "алга болбол" эхлээд schema-г шалга.

## Document: хайх

```ts
const all = await Book.find();                         // Book documents (array, maybe empty)
const old = await Book.find({ year: { $lt: 1970 } });  // filter
const one = await Book.findOne({ title: 'Dune' });     // first match or null
const byId = await Book.findById(someId);              // by _id (string ok — it's cast), or null
```

`find` нь **array** буцаана, хоосон ч байж болно. `findOne`/`findById` бол **document эсвэл `null`**: хэзээ ч `undefined` биш, юу ч таарахгүй үед throw ч хийхгүй. `null`-ыг заавал боловсруул.

Эдгээр method promise биш, **Query** буцаана. Query бол `await` хийх хүртэл залгаж болдог builder:

```ts
const recent = await Book.find({ tags: 'scifi' })
  .sort({ year: -1 })     // newest first
  .limit(5)
  .select('title year');  // projection: only these fields (+ _id)
```

Query `await` хийгдэх үед л ажиллана (үүнийг "thenable" гэдэг). Тэр болтол зөвхөн query-гээ дүрсэлж байгаа тул алхам алхмаар бүтээж болдог. Module 3-т үүнийг олон дахин хийнэ.

### Document ба lean object

Default-оор бүтэн **Mongoose document** ирнэ, тэгээд энэ нэлээд хүнд: change tracking, getter, method бүгд дагалдана. Зөвхөн *унших*, өгөгдлийг хаа нэгтээ дамжуулах бол `.lean()`-ээр **энгийн object** авч болно:

```compare
--- a Document (default)
const b = await Book.findOne({ title: 'Dune' });
b.id;            // "66f1…" — a virtual string getter
b.title = 'Dune Messiah';
await b.save();  // works: it's a live document
b instanceof Book; // true
--- a lean object
const b = await Book.findOne({ title: 'Dune' }).lean();
b.id;            // undefined! — no virtuals on plain objects
b._id;           // ObjectId(…) — still here
b.save;          // undefined — it's just data
// much smaller in memory, faster to create
```

Энэ `id`-ийн ялгаа Part II-д их чухал болно: GraphQL type-д ихэвчлэн `id` field байдаг, харин resolver lean object буцаавал `id` чимээгүйхэн `null` болж гарна. Үүнийг нэг санаарай.

## Бүтэн жишээ

Bookshelf model-ийг жижиг "repository" function-аар гүйцээе. Repository function гэдэг нь query-г өөртөө багтаасан function, ингэснээр app-ын бусад хэсэг filter-ийг гараараа бүтээх шаардлагагүй болно:

```ts title="models/Book.ts"
export function findBooksByAuthor(author: string) {
  return Book.find({ author }).sort({ year: 1 });
}
```

```ts title="playground.ts"
import { Book, findBooksByAuthor } from './models/Book';

await Book.create([
  { title: 'The Dispossessed', author: 'Ursula K. Le Guin', year: 1974 },
  { title: 'A Wizard of Earthsea', author: 'Ursula K. Le Guin', year: 1968 },
  { title: 'Kindred', author: 'Octavia E. Butler', year: 1979 },
]);

const books = await findBooksByAuthor('Ursula K. Le Guin');
console.log(books.map((b) => `${b.year} ${b.title}`));
// [ '1968 A Wizard of Earthsea', '1974 The Dispossessed' ]
```

`Book.create([...])`-г **array**-аар дуудвал хэд хэдэн document нэг дор орно (тус бүрийг нь validate хийнэ).

```quiz
Q: Ийм ном байхгүй үед `Book.findOne({ title: 'Nope' })`:
- [ ] NotFound алдаа throw хийнэ
- [x] `null`-аар resolve болно
- [ ] `undefined`-аар resolve болно
- [ ] `[]`-аар resolve болно
> `findOne`, `findById` юу ч таарахгүй үед `null`-аар resolve болно. `find` бол хоосон array буцаана.
```

```quiz
Q: Resolver `await Book.findById(id).lean()` буцаасан ч GraphQL-ийн `id` field `null` ирж байна. Яагаад вэ?
- [ ] `lean()` нь `_id`-г хасчихдаг
- [x] `id` бол document дээрх virtual getter, lean энгийн object-д байхгүй
- [ ] `findById` нь lean-тэй ажилладаггүй
> Lean object `_id`-г хадгалсан ч virtual-гүй. Шийдэл нь `.lean()`-ийг аваад хаях, эсвэл `_id`-г `id` болгож өөрөө map хийх хоёрын нэг. Сүүлийнхийг Part II-д хийнэ.
```

Эхний model-оо бичихэд хангалттай мэдлэгтэй боллоо. Дараагийн drill Bookshelf-тэй адил бүтэцтэй, гэхдээ жишээнд байгаагүй хэдэн зүйл нэмэгдсэн.
