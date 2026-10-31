---
title: "Query: operator, динамик filter, pagination"
source: 45a4a96b4f6c100bd8663d7af08389777530c707c91e91b8d44e0af25c887fd8
---

Database-д хандсан backend кодын ихэнх нь ямар нэг хэлбэрээр "user хэдэн filter, sort, нэг хуудас сонгосон, таарсан мөрүүдийг аваад ир" гэсэн ажил. Том codebase-д энэ код ихэвчлэн **repository** function дотор байдаг. Гайхмаар олон bug яг энд нуугддаг: чимээгүйхэн юу ч олохгүй filter, нэг item-ийг давтан гаргадаг хуудас, `(` гэж бичихэд унадаг хайлтын талбар. Энэ хичээл тэдгээр function-ийг зөв бичих тухай.

> [!BRIDGE]
> SQL бичиж байсан бол эдгээр query юу хийхийг чи аль хэдийн мэднэ. Зөвхөн бичигдэх хэлбэр өөр:
>
> | SQL | Mongoose |
> | --- | --- |
> | `WHERE year >= 1960` | `.find({ year: { $gte: 1960 } })` |
> | `WHERE format = 'EBOOK' AND year > 2000` | `.find({ format: 'EBOOK', year: { $gt: 2000 } })` |
> | `SELECT title, year` | `.select('title year')` |
> | `ORDER BY year DESC` | `.sort({ year: -1 })` |
> | `LIMIT 20 OFFSET 40` | `.limit(20).skip(40)` |

## Operator-ын багц

`$gte`, `$lt`-ийг чи харсан. Ажил дээр ихэвчлэн хэрэглэх operator-ууд нь эдгээр. Жишээ бүгд Bookshelf-ээс:

| Operator | Утга | Жишээ |
| --- | --- | --- |
| `$eq` / `$ne` | тэнцүү / тэнцүү биш | `{ format: { $ne: 'EBOOK' } }` |
| `$gt` `$gte` `$lt` `$lte` | харьцуулалт (тоо, огноо, string) | `{ year: { $gte: 1960, $lt: 1970 } }` |
| `$in` / `$nin` | утга жагсаалтын нэг мөн (биш) | `{ format: { $in: ['HARDCOVER', 'PAPERBACK'] } }` |
| `$exists` | field байгаа эсэх | `{ isbn: { $exists: false } }` |
| `$or` | хэд хэдэн filter-ийн аль нэг | `{ $or: [{ year: { $lt: 1900 } }, { tags: 'classic' }] }` |
| `$all` | array эдгээрийн бүгдийг агуулсан | `{ tags: { $all: ['scifi', 'classic'] } }` |
| `$elemMatch` | array-ийн нэг element бүх нөхцөлийг хангана | доор харъя |
| `$regex` | string дээр pattern-аар хайх | `{ title: { $regex: 'dune', $options: 'i' } }` |

Filter-ийн дээд түвшний нөхцөлүүд хоорондоо AND-аар холбогдоно. Ил `$and` хэрэг болох нь нэг key давтагдах үед л, жишээ нь хоёр тусдаа `$or`.

### `$elemMatch`-ийн урхи

Ном бүр review subdocument-уудын array-тай. Чи **sam 5 од өгсөн** номуудыг хайж байна:

```compare
--- looks right, isn't
Book.find({
  'reviews.by': 'sam',
  'reviews.rating': 5,
})
// matches a book where sam gave 1 star
// and someone ELSE gave 5 stars
--- what you meant
Book.find({
  reviews: { $elemMatch: { by: 'sam', rating: 5 } },
})
// both conditions must hold
// for the SAME array element
```

Array дээрх dot-path нөхцөл бүр бусдаас хамаарахгүй, *аль нэг* element-тэй таарвал хангагдана. Хэд хэдэн нөхцөл **нэг** element дээр зэрэг биелэх ёстой бол `$elemMatch` хэрэглэ.

## Filter-ийг динамикаар бүтээх

Хайлтын endpoint-д хэд хэдэн заавал биш оролт ирдэг. Pattern нь: **үргэлж үйлчлэх нөхцлөөс эхэл, оролт нь үнэхээр ирсэн үед л түүний key-г нэм.**

```ts title="repositories/books.ts"
interface BookSearch {
  author?: string;
  tag?: string;
  sort?: 'newest' | 'title';
}

export function searchBooks({ author, tag, sort = 'newest' }: BookSearch) {
  const filter: Record<string, unknown> = {};
  if (author) filter.author = author;
  if (tag) filter.tags = tag;

  const order = sort === 'title' ? { title: 1 } : { year: -1 };
  return Book.find(filter).sort(order);
}
```

`if`-үүд яагаад хэрэгтэй вэ? `Book.find({ author, tag })` гэж шууд бичиж болдоггүй юм уу? Учир нь:

> [!CAUTION] Filter доторх `undefined` алгасагддаггүй
> `Book.find({ author: undefined })` нь "дурын зохиолч" гэсэн утга **биш**. MongoDB үүнийг `null` гэж үзэх тул `author` нь **байхгүй эсвэл null** document-уудтай таарна. Зохиолчийн filter өгөөгүй хайлт… зөвхөн зохиолчгүй номуудыг буцаадаг гэсэн үг. Код нь *зүгээр харагддаг* болохоор энэ bug code review-ээс байнга гулсдаг.

Харин `null` *утга учиртай* үед (жишээ нь "assignee-гүй issue-г харуул") үүнийг "filter огт өгөөгүй" гэсэн тохиолдлоос тусад нь, санаатайгаар бич. Forge step дээр яг үүнийг хийнэ.

## Текст хайлтын урхинаас зайлсхийх

Хамгийн энгийн нь "title дотор агуулсан" хайлт:

```ts
filter.title = { $regex: input, $options: 'i' };
```

…гэвч хэн нэгэн `C++` гэж хайхад л эвдэрнэ: `+` бол regex-ийн quantifier, хаагдаагүй `(` бол throw хийнэ. Бас хэн ч `(a+)+$` шиг pattern явуулж болно, ийм pattern-ийг боловсруулахад экспоненциал хугацаа орно. **Regex-д орох user-ийн оролтыг заавал escape хий**:

```ts
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

filter.title = { $regex: escapeRegex(input.trim()), $options: 'i' };
```

Тусгай тэмдэгт бүр энгийн тэмдэгт болно. `C++` гэж хайвал `C++` гэсэн текстийг л олно.

> [!NOTE]
> Том жижгийг ялгахгүй "агуулсан" regex index-ийг үр дүнтэй ашиглаж чадахгүй, MongoDB collection-ыг scan хийнэ. Хэдэн мянган document дээр энэ зүгээр. Хэдэн сая дээр text index эсвэл search engine (Atlas Search, Elasticsearch) руу шилжинэ. Энгийн арга *хэзээ* тэсэхээ болихыг мэдэх нь ажлын нэг хэсэг.

## Projection: зөвхөн хэрэгтэй зүйл

```ts
Book.find(filter).select('title year');          // include: title, year (+ _id)
Book.find(filter).select('-reviews -__v');       // exclude: everything but these
Book.find(filter).select({ title: 1, _id: 0 });  // include title, drop _id
```

Нэг projection-д include, exclude-ийг хольж болохгүй. Ганц онцгой нь `_id`, үүнийг үргэлж хасаж болно. Projection харагдахаас илүү чухал: гарчиг л харуулах гэж ном бүрийн 500 embedded review-г ачаалдаг жагсаалтын хуудас удаан байдаг ч, үүнийг зөвхөн production дээр мэдэрнэ.

## Sort хийх ба pagination

Offset pagination гэдэг нь `skip` + `limit`:

```ts
const page = 3, pageSize = 20;
Book.find(filter).sort({ year: -1 }).skip((page - 1) * pageSize).limit(pageSize);
```

Энэ sort-д нэг нарийн bug хүлээж байна. Хэд хэдэн ном ижил `year`-тэй үед юу болохыг хар:

```viz-pipeline
{
  title: 'sort({ year: -1 }), тэнцсэн утгатай, хуудас бүрд 2 ном',
  color: 'mongo',
  input: { label: 'books', docs: [
    { title: 'A', year: 1979 }, { title: 'B', year: 1979 }, { title: 'C', year: 1979 }, { title: 'D', year: 1965 },
  ], note: 'Гурван ном 1979 оных. Энэ гурвын дараалал **тодорхойгүй**, MongoDB query бүрт өөр өөр дарааллаар буцааж болно.' },
  stages: [
    { label: 'хуудас 1', code: 'skip(0).limit(2)', docs: [{ title: 'B', year: 1979 }, { title: 'A', year: 1979 }], note: 'Эхний request санамсаргүйгээр B, A-г буцаалаа…' },
    { label: 'хуудас 2', code: 'skip(2).limit(2)', docs: [{ title: 'B', year: 1979 }, { title: 'D', year: 1965 }], note: '…хоёр дахь request тэнцсэн номуудыг өөр дарааллаар sort хийлээ: **B хоёр удаа гарч, C хэзээ ч гарахгүй.** Алдаа ч гарахгүй. User зүгээр л давхардсан, дутсан item харна.' },
    { label: 'засвар', code: 'sort({ year: -1, _id: -1 })', docs: [{ title: 'C', year: 1979 }, { title: 'B', year: 1979 }, { title: 'A', year: 1979 }, { title: 'D', year: 1965 }], note: 'Sort-ын хамгийн сүүлийн key болгож **unique tiebreaker** нэм. `_id` давтагдахгүй тул дараалал бүрэн тодорхой болж, хуудсууд тогтвортой болно.' },
  ],
}
```

**Pagination-тай sort-ын сүүлд үргэлж unique field тавь.** Ихэвчлэн `_id`-г сонгодог.

Offset pagination-д дахин хоёр сул тал бий. Нэгт, том `skip` удаан болдог, учир нь database алгассан document бүрийг ч дайраад өнгөрдөг. Хоёрт, хэн нэгэн хуудсуудыг гүйлгэж байх хооронд item нэмэгдвэл үр дүн нэг тийш шилжинэ. Эдгээр хоёуланг засдаг **cursor pagination**-тай Module 9-д танилцъя. Дунд зэргийн өгөгдөл дээр "12 хуудасны 3-р хуудас" гэсэн UI-д offset pagination одоо ч зөв сонголт.

### Item-ууд ба нийт тоо, хамтдаа

Pagination-тай UI-д ихэвчлэн нийт тоо ч хэрэгтэй. Хоёр query-г зэрэг ажиллуул:

```ts
const [items, total] = await Promise.all([
  Book.find(filter).sort(order).skip(skip).limit(pageSize).lean(),
  Book.countDocuments(filter),
]);
return { items, total, pages: Math.ceil(total / pageSize) };
```

Хоёуланд нь **ижил `filter`** орж байгааг анзаараарай: тоо нь бүхэл collection-ыг биш, filter-д таарсныг тоолох ёстой. (`estimatedDocumentCount()` нь metadata-аас бүхэл collection-ы тоог хурдан ойролцоолдог, харин filter-ийг тоохгүй.)

## Query бол builder (мөн `exec()`-ийг хэзээ хэрэглэх)

`Book.find(filter)` нь Query object буцаана. Залгасан method-ууд түүнийг өөрчилж, `await` нь ажиллуулна. Алхам алхмаар ч бүтээж болно:

```ts
let q = Book.find(filter);
if (onlyTitles) q = q.select('title');
const books = await q.sort({ year: -1 }).limit(10);
```

`await q` ажилладаг нь Query *thenable* учраас. `q.exec()` бол жинхэнэ Promise буцаадаг: Promise шаардлагатай үед (жишээ нь `.finally` дууддаг function-д дамжуулахад), эсвэл stack trace цэвэрхэн байлгахыг хүсвэл хэрэглэ. Мөн Query **`await` бүрт нэг л удаа ажиллана**: нэг Query object-ийг хоёр удаа await хийвэл "Query was already executed" гэж throw хийнэ.

```quiz
Q: `Issue.find({ project: id, assignee: filter.assigneeId })`-г `filter = {}`-тай дуудлаа. Юу буцах вэ?
- [ ] Project-ийн бүх issue
- [x] Project-ийн зөвхөн assignee-гүй issue-ууд
- [ ] Алдаа: assignee нь undefined
> MongoDB filter-д `undefined` нь `null`-тай адил: field нь байхгүй эсвэл null document-уудтай таарна. `assignee`-г filter-т зөвхөн үнэхээр өгөгдсөн үед нэм.
```

```quiz
Q: Pagination-тай query-ийн sort-ын сүүлийн key болгож `_id`-г яагаад нэмдэг вэ?
- [ ] Query index ашиглах болно
- [ ] MongoDB sort бүрт `_id` шаарддаг
- [x] Дарааллыг бүрэн тодорхой болгодог тул sort-ын утга нь ижил document-ууд хуудас хооронд шилжихгүй
> Unique tiebreaker байхгүй бол sort key дээр тэнцсэн document-ууд query бүрт өөр дарааллаар буцаж болно, үүнээс хуудсуудын хооронд давхардал, дутагдал гарна.
```
