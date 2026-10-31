---
title: "Validation: дүрэм, алдаа, мөн validator биш нэг зүйл"
source: 23ea81ea040b65a170aaeeab7d54bb6428cee5f3f12a49facb9f852daeaabfeb
---

Validation бол муу өгөгдөл орж ирэхээс өмнө чиний data layer *үгүй* гэж хэлэх мөч. API-ийн алдааны мессеж хамгийн түрүүнд эндээс төрдөг: user хоёр үсэгтэй гарчигтай form илгээхэд харагдах мессеж анх Mongoose validator-оос гарсан байдаг. Тиймээс хоёр талыг нь үзье: дүрэм бичих, тэр дүрмээс гарах error-ыг унших.

## Built-in validator-ууд

Schema-н төрөл бүр хэдэн validator-тай ирдэг. `required`, `enum` хоёртой чи аль хэдийн танилцсан. Өдөр тутам хэрэглэх бүх validator:

| Validator | Ажиллах төрөл | Жишээ |
| --- | --- | --- |
| `required` | дурын | `title: { type: String, required: true }` |
| `min` / `max` | Number, Date | `rating: { type: Number, min: 1, max: 5 }` |
| `minlength` / `maxlength` | String | `title: { type: String, minlength: 2, maxlength: 200 }` |
| `match` | String | `isbn: { type: String, match: /^\d{13}$/ }` |
| `enum` | String, Number | `format: { type: String, enum: ['HARDCOVER', 'PAPERBACK', 'EBOOK'] }` |

Тус бүр нь **custom message** авна, `[value, message]` хос эсвэл object хэлбэрээр:

```ts title="models/Book.ts"
const bookSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Every book needs a title'],
    maxlength: [200, 'Title is too long ({VALUE})'],
  },
  rating: { type: Number, min: [1, 'Rating starts at 1'], max: 5 },
  format: {
    type: String,
    enum: { values: ['HARDCOVER', 'PAPERBACK', 'EBOOK'], message: '{VALUE} is not a format we sell' },
  },
});
```

`{VALUE}`, `{PATH}` автоматаар бөглөгдөнө. Мессежийг *user* өөрөө ойлгож, засаж чадахаар бич, учир нь Part II-д эдгээр API response руу шууд орно.

> [!WARNING]
> String дээрх `required: true` **хоосон string** `''`-г ч няцаана. Харин array дээр `required` ашиггүй: array-ийн default нь `[]`, үүнийг "байгаа" гэж тооцдог. Оронд нь custom validator-оор `length`-ийг шалга.

> [!BRIDGE]
> PostgreSQL дээр `NOT NULL`, `CHECK (rating BETWEEN 1 AND 5)` нь table-ийн дүрэм, хэн бичсэн ч database өөрөө мөрдүүлнэ. Mongoose validator ижил санаа шиг харагдавч чиний Node process дотор амьдарна. Collection дээр validation-аа өөрөө тохируулаагүй бол MongoDB өгсөн бүхнийг хадгална, тэгэхээр Mongoose-ийг тойрсон script чиний дүрмийг ч тойрч гарна.

## Custom validator

Built-in хүрэлцэхгүй бол function бич. Хүчинтэй бол `true`, хүчингүй бол `false` буцаа:

```ts
const bookSchema = new Schema({
  isbn: {
    type: String,
    validate: {
      validator: (v: string) => isValidIsbn13(v), // checksum, not just digits
      message: (props) => `${props.value} is not a valid ISBN-13`,
    },
  },
});
```

Validator `async` байж болно (promise буцаана), жишээ нь өөр service дуудахад. Хэрэглэхдээ хэмнэлттэй бай: save бүрт ажиллана.

Built-in-д байхгүй нэг зүйлийг custom validator хийж чадна: **бусад field-ийг харах**. Энгийн `function` (arrow function биш шүү!) дотор `this` нь validate хийгдэж буй document болно. Үүнийг санаж яваарай, drill дээр хэрэг болно.

## Validation хэзээ ажилладаг вэ

```viz-flow
{
  colWidth: 190,
  nodes: [
    { id: 'save', label: 'doc.save()', sub: 'Model.create()', col: 0, row: 0, color: 'mongo' },
    { id: 'val', label: 'doc.validate()', col: 0, row: 1, color: 'mongo' },
    { id: 'upd', label: 'updateOne()', sub: 'findOneAndUpdate()…', col: 0, row: 2, color: 'bad' },
    { id: 'run', label: 'validator-ууд ажиллана', col: 2, row: 0.5, color: 'ok' },
    { id: 'skip', label: 'validator-ууд АЛГАСАГДАНА', sub: 'runValidators: true биш бол', col: 2, row: 2, color: 'bad', w: 180 },
  ],
  edges: [
    { from: 'save', to: 'run' },
    { from: 'val', to: 'run' },
    { from: 'upd', to: 'skip' },
  ],
}
```

Validation `save()` дээр (тэгэхээр `create()` дээр), мөн `validate()`-ийг өөрөө дуудахад ажиллана. Update query дээр default-оор **ажилладаггүй**: `updateOne({ ... }, { rating: 99 })` 99-ийг дуртайяа бичнэ. Энэ урхи Module 3-т бүтэн нэг хэсэг авахаар том. Одоохондоо ганц зүйл мэдэхэд хангалттай: document-уудаар дамжуулж бичвэл чи хамгаалагдсан.

Хадгалахгүйгээр ч *validate* хийж болно. Үнэтэй юм хийхээс өмнө form-оо шалгахад тустай:

```ts
const book = new Book({ title: '', rating: 9 });
try {
  await book.validate(); // runs every validator, throws a ValidationError — nothing is saved
} catch (err) {
  // inspect it (see below)
}
```

> [!NOTE]
> Хуучин код, tutorial-ууд `doc.validateSync()` хэрэглэж байдаг. Энэ одоо ч ажиллах боловч **Mongoose 9-д deprecated** болсон, бас async validator-уудыг алгасна. `await doc.validate()`-ийг илүүд үз. Deprecated API-г анзаарч сурах нь том codebase дээр хэрэгтэй чадвар. Хуучин major version дээр бичигдсэн кодыг өвлөх нь олонтоо тохиолдоно.

## ValidationError-ыг унших

Хүмүүс энэ хэсгийг алгасдаг. Тэгээд `catch (e) { res.send(e.message) }` гэж бичиж, user toast дээр ``Book validation failed: title: Every book needs a title, rating: Path `rating` (9) is more than maximum allowed value (5).`` гэсэн юм харна. Оронд нь дотор нь юу байгааг харъя.

Mongoose эхний асуудал дээрээ зогсдоггүй, унасан path **бүрийг** цуглуулдаг:

```viz-tree
{
  title: 'await Book.create({ title: "", rating: 9, year: "soon" })  →  throw хийнэ',
  root: {
    label: 'err  (ValidationError)', color: 'bad', id: 'err',
    children: [
      { label: 'name: "ValidationError"', color: 'neutral' },
      { label: 'message: "Book validation failed: title: …, rating: …"', color: 'neutral' },
      { label: 'errors', color: 'bad', id: 'errors', children: [
        { label: 'title', id: 'title', color: 'bad', children: [
          { label: 'kind: "required"', color: 'neutral' },
          { label: 'message: "Every book needs a title"', color: 'neutral', id: 'tmsg' },
        ]},
        { label: 'rating', id: 'rating', color: 'bad', children: [
          { label: 'kind: "max"', color: 'neutral' },
          { label: 'value: 9', color: 'neutral' },
        ]},
        { label: 'year', id: 'year', color: 'bad', children: [
          { label: 'name: "CastError"', color: 'neutral', id: 'cast' },
          { label: 'kind: "Number"', color: 'neutral' },
        ]},
      ]},
    ],
  },
  steps: [
    { focus: ['err'], caption: 'Бүх document-д зориулсан нэг error object. `err.name === "ValidationError"` гэж таньна (`err instanceof mongoose.Error.ValidationError` ч ажиллана).' },
    { focus: ['errors'], caption: '`err.errors` бол **path**-аар key хийгдсэн object. Validation унасан field бүрт нэг entry бий, зөвхөн эхнийх нь биш.' },
    { focus: ['title', 'tmsg'], caption: 'Entry бүр `kind` (аль дүрэм унасан), `path`, `value`, мөн хүнд зориулсан `message`-тэй. Custom мессеж бичсэн бол тэр нь энд гарна.' },
    { focus: ['year', 'cast'], caption: 'Casting-ийн алдаа ч энд орно, `CastError` хэлбэрээр, `kind` нь зорилтот төрөл байна. `"soon"` Number болж чадаагүй.' },
  ],
}
```

Үүнийг API буцааж чадах хэлбэрт оруулахад хэдхэн мөр хангалттай:

```ts
function fieldErrors(err: mongoose.Error.ValidationError) {
  return Object.fromEntries(Object.entries(err.errors).map(([path, e]) => [path, e.message]));
}
// { title: 'Every book needs a title', rating: 'Path `rating` (9) is more than…', year: 'Cast to Number failed…' }
```

Яг ийм mapping-ийг Module 8-д бичнэ, тэнд энэ нь field-ийн дэлгэрэнгүйтэй GraphQL error болно.

## `unique` бол validator биш

Энэ бол Mongoose-ийн хамгийн их буруу ойлгогддог option, тиймээс нарийн хэлье.

```ts
email: { type: String, unique: true }
```

Энэ нь хадгалах үед **юу ч** шалгадаггүй. Зүгээр л Mongoose-д MongoDB дотор **unique index** үүсгэ гэж хэлнэ. Давхардал үүсгэх insert, update бүрийг дараа нь *database* өөрөө няцаана, тиймээс чамд огт өөр төрлийн error ирнэ:

```compare
--- a ValidationError (Mongoose)
{
  name: 'ValidationError',
  errors: { title: { kind: 'required', … } }
}
// thrown before anything is sent to MongoDB
--- a duplicate key error (MongoDB)
{
  name: 'MongoServerError',
  code: 11000,
  keyValue: { email: 'ada@example.com' },
  message: 'E11000 duplicate key error collection: app.users index: email_1 dup key: …'
}
// thrown BY the database, during the insert
```

Insert хийхээс өмнө "энэ email байгаа юу?" гэж шалгаад болохгүй гэж үү? Учир нь:

```viz-sequence
{
  title: 'Ижил email-ээр хоёр бүртгүүлэлт, 3ms зайтай',
  actors: [
    { id: 'a', label: 'request A', color: 'neutral' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
    { id: 'b', label: 'request B', color: 'neutral' },
  ],
  steps: [
    { from: 'a', to: 'db', label: 'findOne({ email })', note: 'Request A эхэлж шалгана: ada@example.com аль хэдийн авагдсан уу?' },
    { from: 'b', to: 'db', label: 'findOne({ email })', note: 'Request B бараг яг тэр мөчид шалгана.' },
    { from: 'db', to: 'a', label: 'null', ret: true, note: 'Авагдаагүй. A аюулгүй гэж бодно.' },
    { from: 'db', to: 'b', label: 'null', ret: true, note: 'Авагдаагүй. B *ч бас* аюулгүй гэж бодно.' },
    { from: 'a', to: 'db', label: 'insert', note: 'A insert хийнэ.' },
    { from: 'b', to: 'db', label: 'insert', note: 'B insert хийнэ. **Unique index байхгүй бол одоо чамд хоёр Ada бий.** Index байвал энэ insert E11000-аар унана, учир нь хоёр бичилтийг дарааллаар нь харж чадах цорын ганц газар бол database.' },
  ],
}
```

Шалгаад дараа нь insert хийх аргад шалгалт болон insert хоёрын хооронд цоорхой бий. Unique index-д цоорхой байхгүй. ("Email аль хэдийн авагдсан" гэсэн урьдчилсан шалгалт UX-д одоо ч сайн, зүгээр л түүнд хэзээ ч бүү найд.)

Практик үр дагавар хоёр байна:

1. **Index эхлээд үүссэн байх хэрэгтэй.** Mongoose model-ийг анх хэрэглэх үед index-үүдийг арын горимд бүтээдэг (`autoIndex`). Тест, эсвэл шууд insert хийдэг script дээр `await User.init()`-ээр (эсвэл `syncIndexes()`-ээр) хүлээ. Production дээр багууд `autoIndex`-ийг ихэвчлэн унтрааж, index-үүдээ deploy script-ээр удирддаг, учир нь том collection дээр index бүтээх нь үнэгүй биш.
2. **Давхардал аль хэдийн байвал index үүсэхгүй.** Давхардалтай field дээр `unique` нэмбэл index бүтээх нь унана (autoIndex-тэй үед арын горимд, чимээгүйхэн). Тэгээд чамд unique байдал огт байхгүй, учрыг нь ч мэдэхгүй байна. Эхлээд өгөгдлөө цэвэрлэ.

Index-ийг schema өөр дээр нь ч зарлаж болно, хэд хэдэн field дээрх **compound** index-ийг ч гэсэн:

```ts
// a user can review a given book only once
reviewSchema.index({ book: 1, user: 1 }, { unique: true });
```

Unique байдал *хослол* дээр үйлчилнэ: нэг user олон номд review бичиж болно, олон user нэг номд review бичиж болно.

## Default-ууд

```ts
status: { type: String, default: 'DRAFT' },
publishedAt: { type: Date, default: Date.now },   // a function: called per document ✔
// publishedAt: { type: Date, default: Date.now() }  // a value: computed ONCE at startup ✘
```

Сүүлийн мөр бол жинхэнэ bug: document бүр чиний server-ийг *асаасан* үеийн timestamp-ыг авна. Function-ыг дамжуул, бүү дууд.

```quiz
Q: `email` дээр `unique: true` нэмээд, тест дотор ижил email-тэй хоёр user-ийг шууд insert хийлээ. Хоёулаа амжилттай болсон. Хамгийн магадлалтай шалтгаан юу вэ?
- [ ] `unique` нь зөвхөн `required`-тай хамт ажилладаг
- [x] Insert-үүд ажиллах үед unique index хараахан бүтээгдээгүй байсан
- [ ] `create()` Mongoose validator-уудыг алгасдаг
> Index-үүд asynchronous байдлаар үүсдэг. Insert хийхээс өмнө `await User.init()` (эсвэл `syncIndexes()`) хий. Мөн санаарай: давхардлыг Mongoose validator биш, MongoDB 11000 кодтойгоор няцаадаг.
```

```quiz
Q: Custom validator нэг document-ын хоёр field-ийг харьцуулах хэрэгтэй. Аль хэлбэр ажиллана вэ?
- [ ] `validator: (v) => v > this.start`
- [x] `validator: function (v) { return v > this.start; }`
- [ ] `validator: (v, doc) => v > doc.start`
> Arrow function өөрийн `this`-гүй. Mongoose validator-ыг `this`-ээр нь document-д холбож дууддаг тул энгийн function хэрэгтэй.
```
