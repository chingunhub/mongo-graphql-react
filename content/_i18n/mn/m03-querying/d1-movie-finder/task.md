---
title: "Drill: Кино хайлт"
summary: "Заавал биш filter-тэй хайлтын function: хүрээ, аюулгүй текст хайлт, тогтвортой sort, хуудасны metadata."
source: 3ef4a4f8fe63bf904142904acfdc03148463e3f6184608ce64fca9fc7f3560b9
---

`Movie` model бэлэн, `models/Movie.ts`-г уншаад үз. Чиний ажил бол хажуудаа filter-ийн sidebar-тай "browse movies" хуудасны ард ажиллах хайлтын function бичих.

## Даалгавар

`repositories/movies.ts`-д `findMovies(options)`-ыг хэрэгжүүл. Option бүр заавал биш:

| Option | Утга |
| --- | --- |
| `genre` | `genres` array нь энэ genre-г агуулсан кино |
| `minRating` | `rating` энэ утгаас багагүй |
| `yearFrom`, `yearTo` | `year` энэ хүрээнд багтана (**хоёр хязгаар нь орно**). Аль нэг хязгаарыг ганцаараа өгч болно. |
| `search` | том жижгийг ялгахгүй "title-д агуулсан" хайлт. Текст **яг үсгээрээ** таарна: `Mission: Impossible (1996)`-ээр хайхад crash гарахгүй, `.` ч дурын тэмдэгттэй таарахгүй байх ёстой. |
| `sort` | `'rating'` (хамгийн өндөр нь эхэнд), `'year'` (хамгийн шинэ нь эхэнд) эсвэл `'title'` (A→Z). default нь `'rating'`. |
| `page`, `pageSize` | 1-ээс эхэлсэн хуудасны дугаар (default нь `1`) ба хуудасны хэмжээ (default нь `10`, **50-иас хэтрэхгүй**). |

Дараах хэлбэрээр resolve болно:

```ts
{
  items: Movie[];   // plain objects for this page
  total: number;    // how many movies match the filters, across all pages
  page: number;     // the page you returned
  pages: number;    // total pages (0 when nothing matches)
}
```

Pagination **тогтвортой** байна: хэд хэдэн кино sort field-дээрээ ижил утгатай байвал, хуудсуудыг дарааллаар нь гүйлгэхэд кино бүр яг нэг удаа гарна.

Өгөөгүй option-ууд юу ч filter хийж болохгүй. (Хичээл дээр `{ genre: undefined }` яагаад урхи болдгийг тайлбарласан.)

## Hints

### Заавал биш хязгаартай хүрээ
Жилийн нөхцөлөө object болгон бүтээгээд, байгаа хязгаарт л `$gte` / `$lte` нэм. `year`-ийг filter-т зөвхөн дор хаяж нэг хязгаар өгөгдсөн үед л оруул.

### Яг үсгээр нь хайх
Regex бүтээхээсээ өмнө оролтоо escape хий: `s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`, дараа нь `{ $regex: escaped, $options: 'i' }`.

### Тогтвортой хуудас ба нийт тоо
Sort бүрт `_id`-г эцсийн tiebreaker болгож нэм, жишээ нь `{ rating: -1, _id: 1 }`. Хуудасны query ба `countDocuments(filter)`-ийг `Promise.all`-аар зэрэг ажиллуулж, `pages`-ийг `Math.ceil(total / pageSize)`-ээр тооцоол.
