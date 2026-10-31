---
title: "Update: atomic operator-ууд ба validator-ын урхинууд"
source: 1972f7d40dcc5ec5ec46feef3164723898e4c8618538e1366fb49e0c9260e97a
---

Өгөгдөл унших нь алдааг уучилдаг: буруу query буруу үр дүн өгвөл чи анзаараад засна. Бичих нь тийм биш. Буруу update бичлэгүүдийг чимээгүйхэн эвдчихдэг, чи хэдэн долоо хоногийн дараа л мэднэ. Тийм учраас энэ хичээл өмнөхөөсөө арай болгоомжтой, зориуд тэгж байгаа юм.

## Document-ыг өөрчлөх хоёр арга

```compare
--- 1. load → modify → save
const book = await Book.findById(id);
if (!book) throw new Error('not found');
book.copiesLeft -= 1;
await book.save();
// ✔ validators + document middleware run
// ✔ easy to read, can run any JS logic
// ✘ two round trips, and a race window
--- 2. update query
await Book.updateOne(
  { _id: id },
  { $inc: { copiesLeft: -1 } },
);
// ✔ one round trip, atomic in MongoDB
// ✘ document middleware does NOT run
// ✘ validators do NOT run (by default)
```

Аль нэг нь "зөв" арга биш. Тус бүр хаана эвдэрдгийг харъя.

### Lost update

Номын санд нэг номоос 1 ширхэг үлдсэн. Хоёр хүн яг зэрэг, load-modify-save аргаар түүнийг зээлэх гэж байна:

```viz-sequence
{
  actors: [
    { id: 'a', label: 'request A', color: 'neutral' },
    { id: 'db', label: 'MongoDB', sub: 'copiesLeft: 1', color: 'mongo' },
    { id: 'b', label: 'request B', color: 'neutral' },
  ],
  steps: [
    { from: 'a', to: 'db', label: 'findById', note: 'A номыг ачаална.' },
    { from: 'db', to: 'a', label: 'copiesLeft: 1', ret: true },
    { from: 'b', to: 'db', label: 'findById', note: 'B хэдхэн мс дараа номыг ачаална. Database одоо ч 1 гэж хэлж байна.' },
    { from: 'db', to: 'b', label: 'copiesLeft: 1', ret: true },
    { from: 'a', to: 'a', label: '1 - 1 = 0', note: 'Хоёулаа JavaScript дотор, өөрсдийн *уншсан* утгаас тооцоолно…' },
    { from: 'b', to: 'b', label: '1 - 1 = 0' },
    { from: 'a', to: 'db', label: 'save → copiesLeft: 0', note: 'A 0 бичнэ.' },
    { from: 'b', to: 'db', label: 'save → copiesLeft: 0', note: '**B ч бас 0 бичнэ.** Хоёр хүн нэг номыг зээлсэн мөртлөө тоо -1 биш 0 гэж харуулна. Нэг зээлэлт чимээгүй алга болсон. Хаана ч алдаа гараагүй.' },
  ],
}
```

Унших, бичих хоёр тусдаа operation, хоёрын завсар нөхцөл байдал өөрчлөгдчихсөн байна. Одоо atomic хувилбар:

```viz-sequence
{
  actors: [
    { id: 'a', label: 'request A', color: 'neutral' },
    { id: 'db', label: 'MongoDB', sub: 'copiesLeft: 1', color: 'mongo' },
    { id: 'b', label: 'request B', color: 'neutral' },
  ],
  steps: [
    { from: 'a', to: 'db', label: 'updateOne({ _id, copiesLeft: { $gte: 1 } }, { $inc: -1 })', note: 'A *нөхцөл*, *өөрчлөлт* хоёрыг хамт илгээнэ. MongoDB шалгах, бичих хоёрыг document тус бүр дээр нэг алхмаар, atomic байдлаар хийнэ.' },
    { from: 'db', to: 'a', label: 'modifiedCount: 1', ret: true, note: 'Таарсан, хасагдсан. copiesLeft одоо 0.' },
    { from: 'b', to: 'db', label: 'updateOne({ _id, copiesLeft: { $gte: 1 } }, { $inc: -1 })', note: 'B яг ижил update илгээнэ.' },
    { from: 'db', to: 'b', label: 'modifiedCount: 0', ret: true, note: '**Таарсангүй**: copiesLeft 0 тул нөхцөл биелэхгүй, юу ч бичигдэхгүй. B ном авч чадаагүйгээ мэдээд user-т хэлж чадна.' },
  ],
}
```

Энэ бол **нөхцөлт update** pattern: урьдчилсан нөхцлийг filter-т, өөрчлөлтийг update-д тавиад, ямар нэг document таарсан эсэхийг шалгана. Stock, суудал, quota, "зөвхөн эзэмшигч засаж болно", "зөвхөн TODO → IN_PROGRESS руу шилжүүлнэ" гээд бүх тохиолдолд ийм байдлаар бичнэ. Энэ Module-ийн хамгийн хэрэгтэй зүйлсийн нэг.

## Update operator-ууд

| Operator | Хийдэг зүйл | Жишээ |
| --- | --- | --- |
| `$set` | field-үүдийг тохируулна | `{ $set: { title: 'Dune', 'author.born': 1920 } }` |
| `$unset` | field-үүдийг устгана | `{ $unset: { isbn: '' } }` |
| `$inc` | тоо нэмнэ (эсвэл хасна) | `{ $inc: { copiesLeft: -1, timesBorrowed: 1 } }` |
| `$push` | array-ийн төгсгөлд нэмнэ | `{ $push: { reviews: { by: 'sam', rating: 5 } } }` |
| `$addToSet` | байхгүй бол нэмнэ | `{ $addToSet: { tags: 'classic' } }` |
| `$pull` | таарсан element-үүдийг хасна | `{ $pull: { tags: 'draft' } }` эсвэл `{ $pull: { reviews: { by: 'sam' } } }` |
| `$each` | олныг нэг дор (`$push`/`$addToSet`-тэй хамт) | `{ $addToSet: { tags: { $each: ['a', 'b'] } } }` |

Mongoose-д operator-гүй энгийн object (жишээ нь `updateOne(filter, { title: 'Dune' })`) нь `$set` гэж тооцогдоно. Эвтэйхэн ч, багийн кодод `$set`-ийг ил бичвэл хэн ч эргэлзэхгүй.

Update-ийн утгыг Mongoose schema-аар дамжуулж **cast** хийсээр байдаг: `lowercase` шиг setter `$set`, `$addToSet`-ийн утгад үйлчилнэ, `{ $set: { year: 'abc' } }` нь CastError throw хийнэ.

`$addToSet` утгыг бүтнээр нь харьцуулдаг. Тиймээс subdocument-ын array дээр "ижил **name**-тэй хоёр label байж болохгүй" гэсэн дүрмийг `$addToSet`-ээр хэлж чадахгүй: энэ нь `{name, color}`-ыг бүхэлд нь харьцуулна. Оронд нь нөхцөлт update хэрэглэ:

```ts
// add the tag only if no tag with that name exists yet
await Book.updateOne(
  { _id: id, 'tags.name': { $ne: tag.name } },
  { $push: { tags: tag } },
);
```

## Document-ыг буцаан авах

`updateOne`/`updateMany` тоо буцаана: `{ matchedCount, modifiedCount, ... }`. Document хэрэгтэй бол `findOneAndUpdate` / `findByIdAndUpdate` хэрэглэ, гэхдээ default-оор юу болдгийг анхаар:

> [!WARNING] Update хийхээс *өмнөх* document-ыг буцаана
> `await Book.findByIdAndUpdate(id, { $set: { title: 'New' } })` **хуучин** document-аар resolve болно. Шинэчлэгдсэнийг авахын тулд `{ returnDocument: 'after' }` дамжуул. Хуучин кодод `{ new: true }` гэж харагдана. Ижил зүйл, гэхдээ **Mongoose 9-д deprecated болсон**.

Юу ч таарахгүй бол `null`-аар resolve болно. Нөхцөлт filter-тэй үед энэ нь "олдсонгүй *эсвэл* нөхцөл биелсэнгүй" гэсэн үг. Хоёрыг нь ялгах шаардлагатай бол хоёр дахь lookup хэрэгтэй.

## Validator-ын урхинууд

Туршлагатай developer-уудыг хүртэл хазадаг хэсэг энэ.

### Урхи 1: update дээр validator унтраастай

```ts
// schema: rating: { type: Number, min: 1, max: 5 }
await Book.updateOne({ _id: id }, { $set: { rating: 99 } }); // ✔ succeeds. rating is now 99.
```

Update query-ууд хүсэхгүй бол **validation-г алгасдаг**:

```ts
await Book.updateOne({ _id: id }, { $set: { rating: 99 } }, { runValidators: true }); // ✘ ValidationError
```

Мартах нь тун түгээмэл учраас олон баг үүнийг `mongoose.set('runValidators', true)` гэж глобалаар нэг удаа тохируулдаг.

### Урхи 2: `runValidators`-тай ч `$inc` validate хийгддэггүй

Update validator зөвхөн `$set`, `$unset`, `$push`, `$addToSet`, `$pull`, `$pullAll` дээр ажилладаг. `$inc` дээр биш:

```ts
// schema: copiesLeft: { type: Number, min: 0 }
await Book.updateOne({ _id: id }, { $inc: { copiesLeft: -5 } }, { runValidators: true });
// ✔ succeeds. copiesLeft is now -4.
```

(Үнэхээр тийм, энэ sandbox дахь Mongoose хувилбар дээр шалгасан.) Засах арга нь өмнөх нөхцөлт update: filter-т `{ copiesLeft: { $gte: 5 } }` тавина. Тооцоолол дээр хамгаалалтын үүрэг гүйцэтгэдэг нь *filter*.

### Урхи 3: `this` нь document биш

Update validator дотор `this` нь document биш, **Query**. "endsAt нь `this.startsAt`-аас хойш байна" гэсэн field хоорондын validator `undefined`-тай харьцуулдаг тул зөв өгөгдөл дээр ч унана. Бүр дордвол, бичсэн хэлбэрээс шалтгаалаад буруу өгөгдлийг нэвтрүүлчихнэ. Хэд хэдэн field-ийг хамарсан дүрэм бол document-ыг ачаалаад `save()` хий, эсвэл service кодондоо ил шалга.

```viz-flow
{
  title: 'Бичих аргаас аль нь, хэзээ?',
  colWidth: 250,
  rowHeight: 80,
  nodes: [
    { id: 'q', label: 'JS логик, hook, эсвэл field хоорондын дүрэм хэрэгтэй юу?', col: 0, row: 0.5, color: 'neutral', w: 230 },
    { id: 'save', label: 'load → modify → save()', sub: 'validator + middleware ажиллана', col: 1, row: 0, color: 'mongo', w: 220 },
    { id: 'upd', label: 'update query', sub: 'atomic · нөхцөл filter-т', col: 1, row: 1, color: 'mongo', w: 220 },
  ],
  edges: [
    { from: 'q', to: 'save', label: 'тийм' },
    { from: 'q', to: 'upd', label: 'үгүй / зэрэг ажиллах' },
  ],
}
```

## Upsert ба delete, товчхон

```ts
// update if exists, insert if not
await Counter.updateOne({ _id: 'books' }, { $inc: { seq: 1 } }, { upsert: true });

await Book.deleteOne({ _id: id });           // { deletedCount: 0 | 1 }
await Book.deleteMany({ tags: 'draft' });
const removed = await Book.findByIdAndDelete(id); // the deleted doc, or null
```

Module 5-д issue дугаарыг (`TF-1`, `TF-2`…) race-гүйгээр үүсгэхийн тулд `$inc`-тэй upsert хэрэглэнэ.

```quiz
Q: `copiesLeft` `min: 0`-тэй. Олон request зэрэг ирсэн ч аль update нь үүнийг хэзээ ч тэгээс доош буулгахгүй вэ?
- [ ] `updateOne({ _id }, { $inc: { copiesLeft: -1 } }, { runValidators: true })`
- [x] `updateOne({ _id, copiesLeft: { $gte: 1 } }, { $inc: { copiesLeft: -1 } })`
- [ ] Document-ыг ачаалж, `copiesLeft > 0` эсэхийг шалгаад, хасаад, `save()` хийнэ
> `runValidators` `$inc`-ийг шалгадаггүй, харин load-check-save-д race үүсэх завсар бий. Урьдчилсан нөхцлийг filter-т тавьснаар шалгах, бичих хоёр нэг atomic operation болно.
```

```quiz
Q: `const doc = await Issue.findByIdAndUpdate(id, { $set: { status: 'DONE' } })` — `doc.status` юу вэ?
- [x] Update хийхээс өмнө ямар байсан тэр
- [ ] `'DONE'`
- [ ] `undefined`
> findOneAndUpdate төрлийн method-ууд default-оор анхны document-ыг буцаана. `{ returnDocument: 'after' }` дамжуул.
```
