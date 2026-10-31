---
title: "Drill: Зохиолч, post-той blog"
summary: select-тэй populate, match ба sort-той virtual populate, мөн count virtual.
source: c0d03e32ef303764b9242100ac0da8507ed5f5912f4550c80a68d02d7800a076
---

Blog-д **зохиолч** ба **post** гэж хоёр зүйл бий. Post бүр өөрийн `author`-ыг (reference) хадгалдаг. Post нь draft байж болно, published байж ч болно. Чиний ажил blog-ийн унших талыг бичих.

## Даалгавар

### 1. `models/Post.ts`

Schema-г дуусга: `author`-ыг нэм, энэ нь `Author` руу заасан **заавал байх reference**. (Бусад field-үүд аль хэдийн бий.)

### 2. `models/Author.ts`

Зохиолчийн schema-д хоёр virtual нэм:

- **`posts`** — зохиолчийн зөвхөн **published** post-ууд, **хамгийн шинэ нь эхэнд** (`publishedAt`-ээр буурах дарааллаар).
- **`publishedCount`** — зохиолчийн published post-уудын **тоо**.

Virtual-ууд `toJSON()` / `toObject()`-д гарч ирэхээр тохируул.

### 3. `repositories/blog.ts`

- **`getPost(id)`** — post-ыг `author`-ыг нь populate хийж буцаана, гэхдээ зөвхөн зохиолчийн `name`, `avatar` (дээр нь `_id`). `email` хэзээ ч орохгүй. Олдохгүй id-д `null`-аар resolve болно.
- **`getAuthorPage(authorId)`** — зохиолчийг `posts`, `publishedCount`-тай нь populate хийж буцаана. Post бүрт зөвхөн `title`, `slug`, `publishedAt` (дээр нь `_id`) орно. Олдохгүй бол `null`.
- **`latestPosts(limit = 5)`** — бүх зохиолчийн хамгийн сүүлийн **published** post-ууд, хамгийн шинэ нь эхэнд, **энгийн object** хэлбэрээр. Post бүрийн `author` нь зөвхөн `{ _id, name }` байхаар populate хийгдсэн.

Хичээлд populate болон count virtual-ийг үзсэн. Энэ drill-д `match`-аар filter хийх, хоёр талд field сонгох нэмэгдэнэ. Хэрэгтэй бол хичээлийн option-ууд хэсгийг дахин унш.

## Hints

### Virtual populate-г filter хийх
Virtual-ийн тодорхойлолт `match`, `options` (`sort`-д зориулсан) хүлээн авна. Published гэдэг нь `published: true`.

### Populate дээр field сонгох
`populate({ path: 'author', select: 'name avatar' })`. `_id`-г хасаагүй бол орно. `posts` дээр `select` яг адилхан ажиллана: `'title slug publishedAt'`.

### Populate-тай энгийн object-ууд
`.lean()` нь `.populate()`-тай хамт ажиллана. Populate хийсэн field ч энгийн object болно.
