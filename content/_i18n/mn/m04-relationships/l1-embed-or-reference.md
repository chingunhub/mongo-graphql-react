---
title: Embed үү, reference үү? Мөн populate үнэндээ яаж ажилладаг вэ
source: 7b31365596e8e78eece0b65faa9c18c3b58bdcd08086002374fd1802ccce2170
---

SQL дээр холбоог ихэнхдээ чиний оронд шийддэг: normalize хийнэ, foreign key нэмнэ, join хийнэ. MongoDB дээр холбоо болгонд өөрөө сонгох хэрэгтэй. Энэ сонголт app ажиллаж байх турш query, performance, bug-уудыг чинь тодорхойлно. Том codebase-ийн models хавтсыг нээгээд ямар нэг зүйл яагаад embed эсвэл reference болсныг уншиж чадвал, өгөгдлийг яаж ашигладаг тухай маш их зүйл хэлж өгнө.

## Хоёр хэлбэр

```compare
--- embed: the child lives inside the parent
// books
{
  _id: …,
  title: "Kindred",
  reviews: [
    { by: "sam", rating: 5, text: "…" },
    { by: "kai", rating: 4, text: "…" }
  ]
}
--- reference: the child has its own collection
// books
{ _id: ObjectId("b1"), title: "Kindred",
  author: ObjectId("a7") }

// authors
{ _id: ObjectId("a7"),
  name: "Octavia E. Butler" }
```

## Шийдвэр гаргах хүрээ

Эдгээр асуултыг ойролцоогоор энэ дарааллаар өөрөөсөө асуу:

| Асуулт | **embed**-ийг заана | **reference**-ийг заана |
| --- | --- | --- |
| Эцэг document бүрт хэдэн child байх вэ? | цөөн, хязгаартай (≤ ~100) | олон, эсвэл *хязгааргүй* |
| Хамт уншигддаг уу? | бараг үргэлж | ихэвчлэн тусад нь |
| Child ганцаараа оршин тогтнох уу? | үгүй, эцэг document-гүйгээр утгагүй | тийм, өөрийн lifecycle, өөрийн хуудастай |
| Нэг child-ийг олон эцэг document хуваалцах уу? | үгүй | тийм (нэг зохиолч олон ном бичдэг) |
| Child хэр олон өөрчлөгддөг вэ? | ховор, эцэг document-тайгаа хамт | байнга, бие даасан байдлаар |

```viz-flow
{
  title: 'Шийдвэрийн товч зам',
  colWidth: 200,
  rowHeight: 84,
  nodes: [
    { id: 'q1', label: 'Хязгааргүй юу?', sub: 'мөнхөд өсч болно', col: 0, row: 0, color: 'neutral' },
    { id: 'q2', label: 'Хуваалцах уу, бие даах уу?', sub: 'өөрийн lifecycle/хуудастай', col: 1, row: 0, color: 'neutral', w: 170 },
    { id: 'q3', label: 'Эцэгтэйгээ хамт уншигдах уу?', col: 2, row: 0, color: 'neutral' },
    { id: 'ref', label: 'Reference', sub: 'өөрийн collection', col: 1, row: 1, color: 'mongo' },
    { id: 'emb', label: 'Embed', sub: 'subdocuments', col: 3, row: 0, color: 'mongo' },
  ],
  edges: [
    { from: 'q1', to: 'ref', label: 'тийм' },
    { from: 'q1', to: 'q2', label: 'үгүй' },
    { from: 'q2', to: 'ref', label: 'тийм' },
    { from: 'q2', to: 'q3', label: 'үгүй' },
    { from: 'q3', to: 'emb', label: 'тийм' },
    { from: 'q3', to: 'ref', label: 'үгүй', dashed: true },
  ],
}
```

Үндэслэлийг нь харахын тулд Taskforge-ийн сонголтуудыг авч үзье:

- **Label → Issue-д embed.** Issue бүрт цөөхөн, issue-тэйгээ үргэлж хамт харагдана, ганцаараа утгагүй.
- **Issue → Project: issue дээр reference** (`issue.project`). Нэг project-д *хязгааргүй* issue байж болно, project document 10,000 issue барьж байхыг хэн ч хүсэхгүй.
- **Project → гишүүд: project дээр reference-үүдийн array.** "Олон-цөөн" холбоо: project-ийн гишүүдийн тоо хязгаартай, user-ууд бие даасан оршино.
- **Comment → өөрийн collection, issue руу reference.** Хязгааргүй (халуун bug 300 comment хүртэл цуглуулж болно), тусад нь ачаалагдана: board дээр биш, issue-ийн хуудсанд.

### Reference хаана байх вэ?

Нэг-олон холбоонд reference-ийг **"олон" талд** хадгал: `issue.comments: [ids]` биш, `comment.issue`. Эцэг document дээр id-ийн array хийвэл embed хийсэнтэй адил хязгааргүй өсөх асуудалтай. Дээрээс нь comment нэмэх болгонд хоёр газар бичиж, хоёуланг нь зөрүүгүй байлгах хэрэгтэй болно. (Issue-ээс *өөрийнх нь* comment-уудыг асуух нь хэвээрээ. Үүнд зориулагдсан нь virtual populate, дараагийн хичээлд.)

> [!TIP] Denormalization зөвшөөрөгдсөн
> Заримдаа бага зэрэг өгөгдлийг санаатайгаар хуулдаг: review `byId`-ийн хажууд `byName: "sam"` хадгалбал review-үүдийг жагсаахад lookup хэрэггүй. Үнэ нь: sam нэрээ солибол хуулбар болгоныг шинэчлэх хэрэгтэй (эсвэл хуучирсан нэрийг хүлээж авна). Энэ нүгэл биш, зүгээр л trade-off. Гагцхүү санаатайгаар хий, аль хуулбар нь үнэний эх сурвалж болохыг бичиж үлдээ.

## Populate

Reference байвал түүний заасан document руу "дагаж" очмоор санагдана. Mongoose-ийн `populate` ObjectId-г заасан document-аар сольж өгдөг:

```ts
const book = await Book.findOne({ title: 'Kindred' }).populate('author');
book.author.name; // "Octavia E. Butler"
```

Join шиг харагдана. **Join биш.** MongoDB онцгой юу ч хийхгүй: Mongoose **хоёр дахь query**-г ажиллуулаад үр дүнг JavaScript дотор угсардаг:

```viz-sequence
{
  actors: [
    { id: 'app', label: 'чиний код', color: 'neutral' },
    { id: 'm', label: 'Mongoose', color: 'mongo' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'app', to: 'm', label: "Book.find().populate('author')" },
    { from: 'm', to: 'db', label: 'books.find({})', note: 'Query 1: номууд хадгалагдсан хэвээрээ. `author` бол зүгээр л ObjectId.' },
    { from: 'db', to: 'm', label: '3 ном', ret: true, payload: '[ { title: "Kindred", author: ObjectId("a7") },\n  { title: "Dawn", author: ObjectId("a7") },\n  { title: "Beloved", author: ObjectId("c2") } ]' },
    { from: 'm', to: 'm', label: 'давхцалгүй id цуглуулах', note: 'Mongoose **бүх** үр дүнгээс ялгаатай `author` id-г цуглуулна: `a7`, `c2`.' },
    { from: 'm', to: 'db', label: 'authors.find({ _id: { $in: [a7, c2] } })', note: 'Query 2: бүгдийн төлөө `$in`-тэй **нэг** query. Ном болгонд тус тусад нь биш.' },
    { from: 'db', to: 'm', label: '2 зохиолч', ret: true },
    { from: 'm', to: 'app', label: 'author object-той номууд', ret: true, note: 'Mongoose id бүрийг тохирох author document-аар сольж өгнө. Ном хэдэн ч байсан нийт хоёр query.' },
  ],
}
```

Тэгэхээр жагсаалт дээр `populate` үр дүнтэй: populate хийсэн path бүрт нэг нэмэлт query л нэмэгдэнэ. Зайлсхийх ёстой нь loop дотор гараар бичдэг хувилбар:

```ts
// ✘ N+1 queries: one for books, then one PER book
const books = await Book.find();
for (const b of books) {
  b.authorDoc = await Author.findById(b.author);
}
```

50 ном байхад 51 round trip болно. Энэ хэв маягийг **N+1** гэдэг. Part II-д GraphQL үүнийг санамсаргүйгээр бичихэд маш амархан болгодог тул дахин том хэмжээгээр тааралдана.

> [!BRIDGE]
> `SELECT b.title, a.name FROM books b JOIN authors a ON a.id = b.author_id` нь нэг query, id-г холбох ажлыг PostgreSQL хийнэ. `populate` бол хоёр query, холбох ажлыг Node хийнэ. `ref` ч foreign key шиг харагдах боловч юу ч албадахгүй: зохиолчийг устгавал түүний номууд юу ч заахгүй id-г хадгалсан хэвээр үлдэнэ.

### Ихэвчлэн хэрэглэх populate option-ууд

```ts
// only some fields of the referenced doc
Book.find().populate('author', 'name');                 // _id + name

// options object: select, match, sort, limit…
Book.find().populate({ path: 'author', select: 'name -_id' });

// several paths
Book.find().populate('author').populate('editor', 'name');

// nested: populate the reviews' authors too
Book.findById(id).populate({ path: 'reviews', populate: { path: 'user', select: 'name' } });

// arrays of ids populate the same way
Book.findById(id).populate('coauthors', 'name');
```

### Populate `null` өгөх үед

Debug хийх ажил эндээс эхэлдэг. Заасан document байхгүй болсон бол (author устгагдсан, буруу id хадгалагдсан) populate-ийн үр дүн нь:

- нэг reference дээр `null`: `book.author === null`,
- reference-үүдийн array-д олдоогүйг нь **чимээгүй хасна**: 3 id орж, 2 document гарна.

Populate "ажиллахгүй" болгодог бусад шалтгаан:

| Шинж тэмдэг | Магадгүй шалтгаан |
| --- | --- |
| `MissingSchemaError: Schema hasn't been registered for model "author"` | `ref: 'author'` нь model-ийн нэр `'Author'`-той таарахгүй байна (том жижиг үсэг ялгана), эсвэл model-ийн файл хэзээ ч import хийгдээгүй |
| `Cannot populate path 'autor' because it is not in your schema` | path-д үсгийн алдаа (Mongoose-ийн `strictPopulate` үүнийг барьж өгдөг, талархаж байгаарай) |
| field одоо ч ObjectId хэвээр | `await` мартсан, эсвэл буцаасан query-гээсээ *өөр* query-г populate хийсэн |
| `null` | заасан document байхгүй, эсвэл хадгалсан id нь түүний `_id`-тай таарахгүй |

Populate-той шууд холбоогүй ч яг хажууд нь тааралддаг харьцуулалтын урхи бас бий:

```ts
book.author === author._id;          // ✘ always false — two different ObjectId objects
book.author.equals(author._id);      // ✔ compares the value
String(book.author) === author.id;   // ✔ compare as strings
```

`ObjectId` бол object, `===` нь identity-г харьцуулдаг. "Id хоёр нь ойлгомжтой ижил, гэтэл шалгалт унаад байна" гэвэл шалтгаан нь энэ.

## `populate` ба `$lookup`

MongoDB-д server-ийн талд ажилладаг жинхэнэ join бий: `$lookup` aggregation stage (Module 5). `populate` ихэвчлэн илүү тохиромжтой: чиний model, casting, select-тэй хамт ажиллана. Харин joined collection-ы field-ээр *filter эсвэл sort хийх* хэрэгтэй үед, эсвэл хоёр талыг хамарсан тооцоо хийх үед `$lookup` нэг round trip-ээр дуусгана.

```quiz
Q: `Book.find().populate('author')` 30 өөр зохиолчийн 200 ном буцаалаа. MongoDB-д хэдэн query хүрэх вэ?
- [ ] 1
- [x] 2
- [ ] 31
- [ ] 201
> Номуудад нэг, дараа нь 30 ялгаатай author id-д зориулсан нэг `$in` query. 201 бол гараар бичсэн loop хийх тоо.
```

```quiz
Q: Project `members: [ObjectId, ObjectId, ObjectId]` хадгалдаг. Эдгээр user-ийн нэг нь устгагдсан. `populate('members')` юу буцаах вэ?
- [ ] Алдаа: заасан document олдсонгүй
- [ ] Устгагдсан user-ийн оронд `null` бүхий array
- [x] Одоо ч байгаа 2 user-ийн array
> Reference-үүдийн array дээр олдохгүй document-ууд чимээгүй хасагддаг. Populate хийсний дараа тоо гэнэт таарахаа больвол юу ч заахгүй болсон reference байгаа эсэхийг шалга.
```
