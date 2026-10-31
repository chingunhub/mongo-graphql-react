---
title: "Checkpoint: Part II-ийн суурь бат уу?"
source: 23c1fed2db3c94e72cb352b890d8fbe5ef2bd0b8ae83933a88b0801ef3290295
---

Server-ийн тал дууслаа. Жинхэнэ repo дахь эхний долоо хоногийн тухай уншихаасаа өмнө энд Part I-ийн төгсгөлд байсантай ижил төрлийн шалгалт байна.

GraphQL, resolver, auth, scaling гэсэн сэдвээс арван асуулт холилдож орно. Энэ шалгалт биш: дүн тавихгүй, юу ч түгжихгүй, хэдэн ч удаа дахин өгч болно. Хариулт бүр дээр аль хичээлээс гарсан нь бичигдсэн. Төгсгөлд нь цааш явах уу, эсвэл эхлээд аль хичээлүүдийг дахин унших вэ гэдгийг хэлнэ.

```checkpoint
Q: Хайлтын хайрцагт user-ийн бичсэнийг GraphQL query-ээр явуулах хэрэгтэй. Зөв арга юу вэ?
L: m06/l1-what-is-graphql
- [ ] Template literal ашиглан query string-д шууд хийх
- [x] Type-тэй variable зарлаад утгыг нь `variables`-аар явуулах
- [ ] HTTP header-т хийх
> SQL-ийг залгаж бүтээдэггүйтэй ижил шалтгаан. Variable утгыг query-аас тусад нь барьж, сервер type-ыг нь шалгана.
---
Q: Аль type нь "үргэлж list, хоосон байж болно, дотор нь ямар ч item хэзээ ч null биш" гэсэн үг вэ?
L: m06/l2-type-system
- [ ] `[Issue]`
- [ ] `[Issue]!`
- [ ] `[Issue!]`
- [x] `[Issue!]!`
> Дотор талын `!` нь item-үүдийн тухай, гадна талын `!` нь list өөрийнх нь тухай.
---
Q: `reporter` нь `User!`, `issues: [Issue]` доторх нэг issue-г ачаалах үед түүний resolver throw хийв. Тэр issue-д юу болох вэ?
L: m06/l3-execution
- [ ] `reporter` null болж ирээд issue бусад талаараа хэвийн
- [x] Бүхэл issue null болж, бусад issue-үүдэд нөлөөлөхгүй
- [ ] Бүх response `data: null` болно
> `reporter` null байж чадахгүй тул null дээш гарч, хамгийн ойрын nullable parent хүртэл очно. Энд тэр нь list item.
---
Q: `Query.books` нь `Book.find().lean()` буцаадаг, schema-д `id: ID!` бий. Client "Cannot return null for non-nullable field Book.id" гэсэн error авав. Яагаад?
L: m07/l1-resolver-anatomy
- [ ] Query `_id`-г асуугаагүй
- [ ] GraphQL ObjectId уншиж чадахгүй
- [x] `id` бол Mongoose document дээрх virtual, lean object-д байдаггүй
> `.lean()`-ийг ав, эсвэл жижиг resolver нэм: `Book: { id: (book) => String(book._id) }`.
---
Q: `updateIssue` нь `if (input.assigneeId) patch.assignee = input.assigneeId` ажиллуулдаг. Client assignee-г арилгахын тулд `assigneeId: null` явуулав. Юу болох вэ?
L: m07/l2-mutations-modules
- [x] Юу ч өөрчлөгдөхгүй, учир нь null falsy тул "явуулаагүй" гэж ойлгогдоно
- [ ] Issue assign хийгдээгүй болно
- [ ] Resolver ажиллахаас өмнө GraphQL null-ыг татгалзана
> Truthiness биш, `!== undefined`-ийг шалга. Байхгүй бол "үлдээ", null бол "арилга" гэсэн үг.
---
Q: "Project-ыг зөвхөн owner нь устгаж чадна." Энэ шалгалт хаана харьяалагдах вэ?
L: m08/l1-context-auth
- [ ] Бусдаасаа өмнө ажиллахын тулд context function-д
- [x] Устгалтыг хийж буй resolver эсвэл service-д, context-оос одоогийн user-ийг ашиглан
- [ ] SDL-д, `deleteProject` field дээр
> Context function нь хэн дуудаж байгааг тодорхойлно. Тэр яг энэ зүйлийг хийж болох эсэх нь operation болон object-оос хамаарах тул шалгалт тэнд хийгдэнэ.
---
Q: Database унтарсан, resolver `new Error('connect ECONNREFUSED 10.0.3.12:27017')` throw хийв. `formatError`-гүй үед client юу харах вэ?
L: m08/l2-errors
- [ ] Ерөнхий "Something went wrong"
- [x] Яг тэр message, дотоод хаяг хүртэл нь
- [ ] Юу ч үгүй, учир нь `NODE_ENV=production` үед Apollo үүнийг хасдаг
> Production горим зөвхөн stack trace-ийг хасдаг. Урьдчилан тооцоогүй error-уудыг `formatError` дотор нуух нь чиний ажил.
---
Q: DataLoader batch function `return User.find({ _id: { $in: ids } })` гэж буцаадаг. Юу нь буруу вэ?
L: m09/l1-n-plus-one
- [ ] Id бүрт нэг query ажиллуулах хэрэгтэй
- [ ] DataLoader Mongoose-ийг дуудаж чадахгүй
- [x] Id бүрт нэг үр дүнг ижил дарааллаар буцаах шаардлагатай, `find` аль алиныг нь амладаггүй
> Id-аар Map бүтээгээд `ids.map(...)` хий, байхгүй бүрт `null`. Үгүй бол author буруу article дээр очиж магадгүй.
---
Q: Client хамгийн шинэ нь эхэнд байхаар pagination хийж байхад хэн нэгэн issue-г хамгийн дээр нэмлээ. `offset` эвдэрдэг ч cursor яагаад тэсвэрлэдэг вэ?
L: m09/l2-pagination
- [x] "Энийг дараа" гэдэг нь үнэн хэвээр, харин "20-ийг алгас" одоо өөр item гэсэн үг болсон
- [ ] Cursor pagination хийж байх хооронд жагсаалтыг түгждэг
- [ ] Cursor-ууд encrypt хийгдсэн байдаг
> Cursor тоо биш, өгөгдөл доторх байрлалыг заадаг тул дээр нь insert хийсэн ч хуудас хөдлөхгүй.
---
Q: "Issue устгахад түүний comment-ууд бас устна." Энэ дүрмийг аль layer эзэмшдэг вэ?
L: m09/l3-architecture
- [ ] Schema
- [ ] Resolver
- [x] Service, учир нь дээр нь ямар API суусан ч дүрэм адилхан
> Resolver хөрвүүлдэг, нимгэн байдаг. Repository зөвхөн хадгалалтыг мэднэ. REST endpoint, queue worker-т ч яг ийм дүрэм хэрэг болно.
```
