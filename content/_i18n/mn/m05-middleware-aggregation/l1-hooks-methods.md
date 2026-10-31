---
title: Hook, method ба static
source: 42f026960eea393835d3983b8d2b0aa5876652fa2891229669ffbdf741ea189f
---

Одоогоор чиний model-ууд өгөгдөл дээр дүрэм нэмсэн хэлбэртэй байлаа. Энэ хичээл **зан төлөв** нэмнэ. Нэгд, database operation-ы тойронд автоматаар ажилладаг код (middleware, өөрөөр хэлбэл hook). Хоёрт, model дээр байдаг function-ууд (method, static). Том codebase-д "ид шид" яг эндээс гардаг: хэн ч дуудаагүй мөртлөө юм хийгддэг. Hook, method *яг хэзээ* ажилладгийг мэдвэл л debug хийж чадна.

## Middleware: operation-ы эргэн тойронд ажиллах код

```ts title="models/Book.ts"
bookSchema.pre('save', async function () {
  // `this` is the document about to be saved
  if (this.isModified('isbn')) {
    this.isbn = this.isbn.replace(/[-\s]/g, ''); // store ISBNs without dashes
  }
});

bookSchema.post('save', function (doc) {
  console.log(`saved book ${doc._id}`);
});
```

`pre` hook operation-аас өмнө, `post` hook дараа нь ажиллана. Pre hook document-ыг өөрчилж болно, эсвэл **throw** хийж operation-ыг зогсоож болно. Тэр error `save()`-ийг дуудсан код руу гарч очно.

> [!IMPORTANT] Mongoose 9: `next()` байхгүй боллоо
> Хуучин код (мөн онлайн tutorial-ын ихэнх) `pre('save', function (next) { …; next(); })` гэж бичдэг. **Mongoose 9 pre middleware-ээс `next` callback-ыг хассан.** Эхний argument нь одоо дуудлагад дамжуулсан option-ууд (дамжуулаагүй бол юу ч биш), түүнийг function шиг дуудвал throw хийнэ. Hook-ыг `async function () { … }` гэж бичээд, зогсоохдоо `throw` хий. Хуучин кодоос ийм хэв маягийг таних нь том codebase-ыг upgrade хийхэд чамд тулгарах яг тэр ажил.

### Save-ийн дараалал

```viz-sequence
{
  actors: [
    { id: 'app', label: 'чиний код', color: 'neutral' },
    { id: 'doc', label: 'Document', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'doc', label: 'doc.save()' },
    { from: 'doc', to: 'doc', label: "pre('validate')", note: 'Хамгийн түрүүнд ажиллана. Validation дараа нь шалгах утгуудыг энд бөглөхөд тохиромжтой.' },
    { from: 'doc', to: 'doc', label: 'validate', note: 'Built-in болон custom validator-ууд. Энд унавал өөр юу ч ажиллахгүй.' },
    { from: 'doc', to: 'doc', label: "pre('save')", note: 'Validation-ы **дараа**. Тиймээс password дээрх `minlength: 8` нь *энгийн* password-ыг шалгаад, дараа нь pre-save hook түүнийг hash хийж чадна. Энэ дараалал санамсаргүй биш.' },
    { from: 'doc', to: 'db', label: 'insertOne / updateOne', note: 'Байгаа document-ын хувьд бүтэн document биш, зөвхөн **өөрчлөгдсөн path**-ууд (`$set`) явна.' },
    { from: 'db', to: 'doc', label: 'ack', ret: true },
    { from: 'doc', to: 'doc', label: "post('save')", note: 'Хадгалагдсан doc-ыг авна. Side effect хийхэд тохиромжтой: log бичих, event гаргах, cache-ыг хүчингүй болгох.' },
    { from: 'doc', to: 'app', label: 'doc', ret: true },
  ],
}
```

Document middleware дотор хоёр method онцгой хэрэг болдог:

- `this.isModified('field')` — document ачаалагдсанаас хойш (эсвэл document шинэ бол) энэ field өөрчлөгдсөн үү? Save болгонд нэг ажлыг дахин хийхээс сэргийлэхэд хэрэглэ.
- `this.isNew` — энэ эхний save (insert) мөн үү?

> [!BRIDGE]
> Express middleware HTTP request-ийг ороодог: `app.use((req, res, next) => …)`. Mongoose middleware database operation-ийг ороодог: `schema.pre('save', …)`. Нэр ижил, санаа ч ижил (ямар нэг зүйлийн тойронд ажилладаг код), харин юу ажиллуулж байгаа нь өөр. `pre('save')` hook seed script, background job дээр бас ажиллана, тэнд request огт байдаггүй.

## Чухал асуулт: аль hook хэзээ ажилладаг вэ?

Middleware хоёр төрөлтэй, тус бүрийг өөр өөр operation ажиллуулдаг:

- **Document middleware** (`validate`, `save`): `this` нь **document**. Document-оор дамжуулж ажиллахад л дуудагдана.
- **Query middleware** (`find`, `findOne`, `updateOne`, `findOneAndUpdate`, `deleteOne`, `countDocuments`…): `this` нь **Query**. Query-ээр дамжуулж ажиллахад л дуудагдана.

Hook-ын хамгийн түгээмэл bug яг энэ хуваагдлаас гарна. Юу ажилладгийг харъя (энэ sandbox-ын Mongoose дээр шалгасан):

| Чи юуг дуудна | Ажиллах hook-ууд | `save` hook-ууд? |
| --- | --- | --- |
| `Book.create(data)` / `doc.save()` | `validate`, `save` (document) | ✔ |
| `Book.insertMany([...])` | `insertMany` (model), `validate` | ✘ |
| `Book.updateOne(filter, update)` | `updateOne` (query) | ✘ |
| `doc.updateOne(update)` | `updateOne` (default-оор **query**) | ✘ |
| `Book.findOneAndUpdate(...)` | `findOneAndUpdate` (query) | ✘ |
| `Book.findById(id)` | `findOne` (query) | — |
| `doc.deleteOne()` | `deleteOne` (default-оор **query**) | — |

```viz-flow
{
  title: 'Сонгодог bug',
  colWidth: 210,
  rowHeight: 76,
  nodes: [
    { id: 'hook', label: "pre('save'): password hash хийх", col: 1, row: 0, color: 'mongo', w: 200 },
    { id: 'signup', label: 'signUp()', sub: 'User.create()', col: 0, row: 0, color: 'ok' },
    { id: 'reset', label: 'resetPassword()', sub: 'User.updateOne()', col: 0, row: 1, color: 'bad' },
    { id: 'db', label: 'users', sub: 'MongoDB', col: 2, row: 0.5, color: 'neutral' },
  ],
  edges: [
    { from: 'signup', to: 'hook' },
    { from: 'hook', to: 'db', label: 'hash хийгдсэн ✔' },
    { from: 'reset', to: 'db', label: 'PLAIN TEXT ✘', color: 'bad' },
  ],
  steps: [
    { focus: ['signup', 'signup>hook', 'hook', 'hook>db', 'db'], caption: 'Sign-up нь `create()` → `save()`-ээр дамждаг тул pre-save hook password-ыг hash хийнэ. Тест давлаа, ship хийчихье.' },
    { focus: ['reset', 'reset>db', 'db'], caption: 'Хэдэн сарын дараа хэн нэгэн password reset-ийг "илүү хялбар" гэж `updateOne`-оор бичнэ. **Update query дээр save hook ажилладаггүй.** Шинэ password plain text-ээр хадгалагдана, алдаа ч гарахгүй.' },
  ],
}
```

Дүрэм data-г ямар аргаар бичсэн ч *заавал* биелэх ёстой бол хоёр замын аль нэгийг сонго. Нэгд, query замуудыг бас хамруул (query middleware `this.getUpdate()` / `this.setUpdate()`-ээр update-ийг уншиж, өөрчилж чадна). Хоёрт, багийн дүрмийг "энэ model руу зөвхөн document-оор дамжуулж бичнэ" гэж тогтоогоод review дээр мөрдүүл.

### Query middleware

`this` нь Query. Түүнийг шалгаж, өөрчилж болно:

```ts
// auto-populate the author on every find* — convenient, and a little dangerous
bookSchema.pre(/^find/, function () {
  this.populate('author', 'name');
});
```

`/^find/` шиг regex нь нэр нь "find"-аар эхэлдэг бүх hook-д таарна: `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`… харин `countDocuments`-д **таарахгүй**. "12 үр дүн" гэж бичсэн хуудасны доор 10 item-ийн жагсаалт гардаг нь ийм учраас.

Hook дотор хэрэгтэй Query method-ууд:

| Method | Юу өгөх вэ |
| --- | --- |
| `this.getFilter()` | filter object |
| `this.where({...})` | filter-т нөхцөл нэмнэ |
| `this.getUpdate()` / `this.setUpdate(u)` | update document (update hook-уудад) |
| `this.getOptions()` | query option-ууд, тэр дундаа `.setOptions({ myFlag: true })`-аар дамжуулсан **өөрийн** option-ууд |

Дашрамд хэлэхэд, тэр auto-populate жишээ бол том codebase-д ихэвчлэн тохиолддог гэнэтийн зүйл. Хэн нэгэн үүнийг нэмчихээд, зургаан сарын дараа ганц query шиг харагддаг халуун зам яагаад хоёр query хийж байгааг хэн ч ойлгохгүй болсон байна. Далд зан төлөвийн өртөг бий: hook-ыг *үнэхээр* үргэлж болох ёстой зүйлд л хэрэглэ.

### Алдаа боловсруулдаг post hook

`post` hook **гурван** parameter-тэй `(error, doc, next)` байвал operation бүтэлгүйтэх үед ажиллана. Хамгийн түгээмэл хэрэглээ нь duplicate-key error-ыг уншигдахуйц болгох:

```ts
userSchema.post('save', function (error: any, _doc: unknown, next: (e?: Error) => void) {
  if (error?.code === 11000) next(new Error('That email is already registered'));
  else next(error);
});
```

(Error боловсруулдаг post hook Mongoose 9-д ч `next`-ээ хэвээр авна. Үүнийг алдсан нь pre hook.)

## Method, static, virtual: аль нь вэ?

```ts
// instance method: behavior of ONE document — `this` is the doc
bookSchema.methods.isClassic = function () {
  return this.year < new Date().getFullYear() - 50;
};

// static: behavior of the MODEL — `this` is the Model
bookSchema.statics.findByIsbn = function (isbn: string) {
  return this.findOne({ isbn: isbn.replace(/[-\s]/g, '') });
};
```

```ts
const book = await Book.findByIsbn('978-0-8070-8305-4'); // static, on the model
book?.isClassic();                                        // method, on a document
```

| | Хаанаас дуудах | `this` нь | Юунд хэрэглэх |
| --- | --- | --- | --- |
| **virtual** | document (property шиг) | document | гарган авсан утга: `book.age`, `user.fullName` |
| **method** | document | document | нэг doc-ын үйлдэл, асуулт: `user.checkPassword(p)`, `order.cancel()` |
| **static** | model | Model | finder, factory: `Book.findByIsbn()`, `Issue.createInProject()` |
| **repository function** | — | — | хэд хэдэн model-д хүрдэг, эсвэл app-ын context хэрэгтэй query |

> [!WARNING]
> Method, static, hook-д `function` хэрэглэ, arrow function биш. Arrow function `this`-ийг өөрийг нь агуулсан модулиас авдаг тул `this.year` нь `undefined` болж, ойлгомжгүй `NaN` гарна.

Logic static дотор байх уу, repository дотор байх уу? Бүх нийтийн дүрэм байхгүй. Боломжийн нэг дүрэм: model-ийн өөрийн invariant-д **static** (дараагийн дугаараа гаргах, natural key-ээр хайх), use-case logic-д **repository/service** (resolver-т хэрэгтэй зүйл, хэд хэдэн model-д хүрэх бүх зүйл). Taskforge хоёуланг нь хэрэглэнэ.

```quiz
Q: `pre('save')` hook `email`-ийг lowercase хийдэг. Admin script `User.updateMany({}, { $set: { email: 'MIXED@Case.com' } })` ажиллуулав. Юу хадгалагдах вэ?
- [ ] `mixed@case.com` — hook document бүр дээр ажилладаг
- [x] Schema-аас хамаарна: hook ажиллахгүй, харин `lowercase: true` setter `$set` дээр ажилласаар байна
- [ ] Юу ч биш — updateMany-г save hook-ууд хориглодог
> `updateMany` query middleware-ийг ажиллуулдаг, `save`-ийг хэзээ ч биш. Харин schema *setter* update-ийг cast хийх үед үйлчилнэ. Энгийн normalize хийхэд hook-оос setter-ийг илүүд үзэх нэг шалтгаан нь энэ.
```

```quiz
Q: Soft-delete hook устгагдсан doc-уудыг нуухдаа `pre(/^find/, …)` хэрэглэжээ. Хуудас "Showing 10 of 12" гэж харуулаад 10 item жагсааж байна, устгагдсан 2 нь хасагдсан. Юу болоод байна вэ?
- [x] `countDocuments` нь `/^find/`-д таардаггүй тул тоонд устгагдсан document-ууд орсон байна
- [ ] Regex буруу байна
- [ ] Soft delete хийсэн doc-ыг тоолох боломжгүй
> Яг ижил hook-ыг `countDocuments`-д бас бүртгэ: `schema.pre(['countDocuments', /^find/], …)`. Эсвэл тоо, жагсаалт хоёрыг нэг function-аар дамжуул.
```
