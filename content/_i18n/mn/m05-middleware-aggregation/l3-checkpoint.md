---
title: "Checkpoint: Part I-ийн суурь бат уу?"
source: 8474945b27ddd2830065dd831fa06e082187f459399854e661907d2c21f02ffa
---

Part I-ийн Mongoose хагасыг дуусгалаа. Түүний дээр GraphQL тавихаас өмнө сул цэг байвал олох хурдан арга энэ.

Part I-ийн булан бүрээс нэг, нийт арван холимог асуулт байна. Энэ шалгалт биш: юу ч үнэлэгдэхгүй, юу ч түгжигдэхгүй, хэдэн ч удаа өгч болно. Хариулт бүр дээр аль хичээлээс гарсан нь бичигдсэн. Төгсгөлд гарах дүн нь цааш явах уу, эсвэл эхлээд аль хичээлүүдийг дахин унших вэ гэдгийг хэлнэ.

```checkpoint
Q: `const book = new Book({ title: 'Dune' })` ажиллуулаад script дуусав. Database-д юу байна?
L: m01/l2-schema-model-document
- [ ] Нэг ном, учир нь `new Book()` үүнийг insert хийдэг
- [x] Юу ч байхгүй, учир нь шинэ document хадгалах хүртлээ зөвхөн memory-д л байдаг
- [ ] Зөвхөн `_id`-тай хоосон ном
> `new Book()` document-ыг memory-д бүтээнэ. MongoDB-д `book.save()`-ээр очно, эсвэл `Book.create()`-ээр хоёуланг нэг дор хий.
---
Q: Schema `rating: { type: Number, max: 5 }` гэж байна. Чи `Book.updateOne({ _id: id }, { $set: { rating: 99 } })` ажиллуулав. Юу болох вэ?
L: m02/l1-validation
- [ ] `ValidationError` throw хийнэ
- [ ] Mongoose утгыг 5 болгоно
- [x] 99 хадгалагдана, учир нь `runValidators` тавихгүй бол update query дээр validator ажилладаггүй
> Validator `save()` дээр ажиллана. Update query `runValidators: true` дамжуулахгүй бол (эсвэл глобалаар тавихгүй бол) шууд MongoDB руу явна.
---
Q: Schema `email: { type: String, unique: true }` гэж байхад ижил email-тэй хоёр sign-up яг нэг зэрэг ирлээ. Хоёр дахь нь юугаар зогсох вэ?
L: m02/l1-validation
- [x] MongoDB-ийн unique index, хоёр дахь insert-ийг `E11000`-ээр унагаана
- [ ] Байгаа user-ийг эхлээд хайдаг Mongoose validator
- [ ] Юу ч үгүй, хэрэв хоёр бичилтийг `try/catch`-д ороогүй бол
> `unique` бол validator биш. Энэ нь index хүсдэг, иймэрхүү race-ийг зөвхөн database шийднэ.
---
Q: Ном өөртөө embed хийсэн array барьдаг, тэр array-д өнөөдрийг хүртэл ирсэн бүх review байна. Array томрох тусам жинхэнэ өртөг нь юу вэ?
L: m02/l2-subdocuments
- [ ] Mongoose 1,000-аас дээш item-тэй array-г validate хийхээ больдог
- [x] Уншилт бүр бүгдийг нь ачаалдаг, мөн document 16 MB-аас хэтэрч чадахгүй
- [ ] Save болгонд array-г sort хийх хэрэгтэй
> Жижиг, хязгаартай зүйлийг embed хий. Хязгааргүй томрох зүйл өөрийн collection-д харьяалагдана.
---
Q: Хайлтын талбар `{ title: { $regex: input, $options: 'i' } }` гэж хийдэг. Хэн нэгэн `C++` гэж хайлаа. Энэ яагаад асуудал вэ?
L: m03/l1-queries
- [ ] `$regex` зөвхөн index-тэй field дээр ажилладаг
- [ ] MongoDB string доторх `+`-ийг няцаадаг
- [x] `input` pattern гэж тооцогддог тул `+` нь quantifier болно, бусад оролт throw хийх эсвэл маш удаан ажиллаж болно
> Regex-д орох user-ийн оролтыг эхлээд escape хий. Эс бөгөөс чиний pattern-ийг user өөрөө бичиж байна гэсэн үг.
---
Q: Хоёр хүн сүүлийн тасалбарыг яг нэг зэрэг худалдаж авч байна. Аль хувилбар хэт зарж чадахгүй вэ?
L: m03/l2-updates
- [ ] Event-ийг ол, `seats > 0` эсэхийг шалга, нэгийг хас, `save()` хий
- [x] `updateOne({ _id: id, seats: { $gt: 0 } }, { $inc: { seats: -1 } })`
- [ ] Баталгаажуулахын тулд event-ийг хоёр удаа ол, дараа нь `save()` хий
> Шалгах, өөрчлөх хоёр нэг operation дотор хамт хийгдэнэ. Find-then-save дээр хоёр request хоёулаа `seats: 1` гэж уншиж болно.
---
Q: `Book.find().populate('author')` 12 өөр зохиолчийн 50 ном буцаалаа. MongoDB-д хэдэн query очих вэ?
L: m04/l1-embed-or-reference
- [x] 2
- [ ] 13
- [ ] 51
> Номд нэг, дараа нь бүх зохиолчийн id-д зориулсан нэг `$in`. 51 query гарах нь номуудаар өөрөө loop хийвэл гарах үр дүн.
---
Q: Virtual populate-тай үед `author.books` дүүрсэн ирнэ. Эдгээр холбоос үнэндээ хаана хадгалагдсан вэ?
L: m04/l2-virtuals
- [ ] Mongoose зохиолч дээр барьдаг array-д
- [x] Номууд дээр, учир нь ном бүр өөрийн `author` reference-ийг барьдаг
- [ ] Далд join collection-д
> Virtual юу ч хадгалдаггүй. Mongoose `Book`-оос `author` нь энэ зохиолчийн `_id`-тай таарах document-уудыг хайна.
---
Q: `pre('save')` password-уудыг hash хийдэг. Шинэ reset feature `User.updateOne({ _id: id }, { password: input })` дууддаг. Юу хадгалагдах вэ?
L: m05/l1-hooks-methods
- [ ] Hash, учир нь hook бичилт болгонд ажилладаг
- [ ] Юу ч үгүй, учир нь `updateOne` тэр field-ийг өөрчилж чадахгүй
- [x] Энгийн password, учир нь update query дээр save hook ажилладаггүй
> `pre('save')` зөвхөн `save()` ба `create()` дээр ажиллана. Аль дуудлагад аль hook ажилладгийг яг мэдэх нь тэр хичээлийн гол санаа.
---
Q: Pipeline `$book`-оор `$group` хийж `avg: { $avg: '$rating' }` тооцоод, дараа нь `$match: { rating: 5 }` хийнэ. Юу гарах вэ?
L: m05/l2-aggregation
- [x] Юу ч үгүй, учир нь `$group`-ийн дараа document-уудад зөвхөн `_id`, `avg` үлддэг
- [ ] Дундаж нь 5 байгаа номууд л
- [ ] Rating нь 5 байсан анхны review-ууд л
> Stage бүр зөвхөн өмнөх stage-ийн гаргасныг харна. `$group`-ийн дараа `rating` алга болсон тул оронд нь `avg` дээр match хийнэ.
```
