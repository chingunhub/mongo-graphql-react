---
title: Subdocument, array ба nesting
source: 992cef04bb5ec7ffaa646c261477f041f30ce97ab6f318567d5a09cbd0cbe37c
---

MongoDB-д document дотор object, мөн object-уудын array байж болно. Mongoose үүнийг дүрслэх хоёр арга өгдөг, хоёр нь зан төлөвөөрөө нэлээд өөр. Тиймээс том codebase дээр model файл нээхдээ аль нь байгааг ялгаж чаддаг байх хэрэгтэй.

## Nested path ба subdocument

```compare
--- nested path (plain object in the schema)
const bookSchema = new Schema({
  title: String,
  author: {
    name: String,
    born: Number,
  },
});
--- subdocument (a schema inside a schema)
const authorSchema = new Schema({
  name: { type: String, required: true },
  born: Number,
});

const bookSchema = new Schema({
  title: String,
  author: authorSchema,
});
```

Хоёулаа MongoDB-д яг ижил хэлбэрээр хадгалагдана: `{ title, author: { name, born } }`. Харин Mongoose тэдгээрийг өөр өөрөөр авч үздэг:

| | Nested path | Нэг subdocument |
| --- | --- | --- |
| `author` өөрөө Document мөн үү? | үгүй, зүгээр л `author.name`, `author.born` path-ууд | мөн, өөрийн `validate`, middleware, method-той |
| `_id` авах уу? | үгүй | **авна, default-оор** (унтраахдаа `{ _id: false }`) |
| `author` бүхэлдээ `null`/байхгүй байж болох уу? | үргэлж "байгаа" (хоосон object) | болно, `undefined` байж болно, `required` ч болно |
| Model хооронд дахин ашиглаж болох уу? | үгүй | болно, ижил `authorSchema`-г хаана ч |

Ерөнхий дүрэм: зүгээр л бүлэглэж байгаа хэдэн холбоотой field (street/city-тэй `address`) бол nested path хангалттай. Өөрийн дүрэмтэй, дахин ашиглах эсвэл array-д хийх *зүйл* бол subdocument schema.

## Subdocument-уудын array

Subdocument-ийн хэрэг яг энд гарна. Номын review-ууд:

```ts title="models/Book.ts" {1-8,12}
const reviewSchema = new Schema(
  {
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, maxlength: 2000 },
    by: { type: String, required: true },
  },
  { timestamps: true },
);

const bookSchema = new Schema({
  title: { type: String, required: true },
  reviews: [reviewSchema],
});
```

Хадгалагдсан ном ямар харагддаг, Mongoose үүнийг яаж хардаг вэ:

```viz-tree
{
  root: {
    label: 'Book document', color: 'mongo', id: 'book',
    children: [
      { label: '_id: ObjectId("66f…01")', color: 'neutral' },
      { label: 'title: "Kindred"', color: 'neutral' },
      { label: 'reviews  (DocumentArray)', color: 'mongo', id: 'arr', children: [
        { label: '[0] Review subdoc', color: 'mongo', id: 'r0', children: [
          { label: '_id: ObjectId("66f…a1")', color: 'neutral', id: 'r0id' },
          { label: 'rating: 5', color: 'neutral' },
          { label: 'by: "sam"', color: 'neutral' },
        ]},
        { label: '[1] Review subdoc', color: 'mongo', id: 'r1', children: [
          { label: '_id: ObjectId("66f…a2")', color: 'neutral' },
          { label: 'rating: 0', color: 'bad', id: 'bad' },
          { label: 'by: "kai"', color: 'neutral' },
        ]},
      ]},
    ],
  },
  steps: [
    { focus: ['arr'], caption: '`book.reviews` бол **DocumentArray**. Энэ нь array-г өргөтгөсөн class, элемент бүр нь subdocument, `reviewSchema`-аар cast, validate хийгдэнэ.' },
    { focus: ['r0', 'r0id'], caption: 'Subdocument бүр default-оор өөрийн `_id`-тэй болдог тул дараа нь `book.reviews.id(reviewId)`-аар нэгийг нь олж болно.' },
    { focus: ['r1', 'bad'], caption: 'Subdocument-ууд **эцэг document-тайгаа хамт** validate хийгдэнэ. Номыг хадгалахад ValidationError гарч унана, path нь array index-тэйгээ хамт `reviews.1.rating`.', reveal: { bad: '!min' } },
  ],
}
```

Subdocument-тай ажиллахдаа эцэг document дээрх array-г өөрчлөөд, эцгийг нь хадгалахад л болно:

```ts
const book = await Book.findById(bookId);

book.reviews.push({ rating: 4, by: 'mo' });   // cast into a subdoc immediately
const r = book.reviews.id(reviewId);          // find by subdoc _id (or null)
r.text = 'Changed my mind';                   // edit in place
book.reviews.pull(otherReviewId);             // remove by _id

await book.save();                            // validates everything, then writes
```

> [!IMPORTANT]
> Subdocument **өөрөө дангаараа хэзээ ч хадгалагддаггүй**. Database руу бичдэг `review.save()` гэж байхгүй: review номын дотор байдаг тул номыг хадгална. Subdoc-д хийсэн өөрчлөлт "тогтохгүй" байвал `parent.save()` мартсан эсэхээ хар.

## Array-ийг бүхэлд нь validate хийх

Array path дээрх validator **бүхэл array-г** хардаг:

```ts
reviews: {
  type: [reviewSchema],
  validate: {
    validator: (arr: unknown[]) => arr.length <= 100,
    message: 'A book can have at most 100 reviews',
  },
},
```

(Товч хэлбэр нь ч ажиллана: `validate: [fn, 'message']`.)

Ялгааг анзаар: элемент бүрийн дүрэм (rating 1–5) **subdocument schema-д**, бүхэл array-ийн дүрэм (100-аас хэтрэхгүй, дор хаяж нэг, давхардалгүй) **array path дээр** байна.

## Embed хийсэн array хэр том болж чадах вэ?

MongoDB document-ын дээд хэмжээ **16 MB**. Үүнээс ч чухал нь, номыг уншихад бүх review нь хамт ачаалагдана, бичих бүрд мөн… за яахав, мэдрэгдэхээр их хэсгийг нь дахин бичнэ. Хязгааргүй өсдөг array бол data modeling-ийн smell: бүх review, хуудас үзсэн бүх тоо, алдартай issue дээрх бүх comment гэх мэт.

Энэ бол Module 4-ийн гол асуулт (embed үү, reference уу?), гэхдээ түргэн дүрэм нь:

- Child жижиг, хязгаартай, бараг үргэлж эцэг document-тайгаа хамт уншигддаг бол **embed** хий: issue-ийн label-ууд, захиалгын line item-ууд, user-ийн хаягууд.
- Child хязгааргүй өсдөг эсвэл өөрийн амьдралтай бол **reference** хий (тусдаа collection): comment-ууд, алдартай бүтээгдэхүүний review-ууд, audit log-ууд.

Taskforge хоёуланг нь хийнэ: label-ууд issue дотор embed хийгдсэн, харин comment-ууд өөрийн collection-той.

```quiz
Q: Issue дээрх label бүрд `name`, `color` байлгаж, харин өөрийн `_id` өгөхгүй байхыг хүсэж байна. Аль хэлбэрийг бичих вэ?
- [ ] `labels: [{ name: String, color: String }], _id: false`
- [x] `labels: [new Schema({ name: String, color: String }, { _id: false })]`
- [ ] `labels: { type: [labelSchema], unique: true }`
> `_id: false`-г `_id` хэрэггүй document-уудын schema дээр тавина. Энд тэр нь label-ийн schema, `new Schema()`-ийн хоёр дахь argument. Эхний хувилбар үүнийг issue-ийн schema дээр тавьчихсан тул issue өөрөө `_id`-гүй болчихно, харин label-уудынх хэвээр.
```

```quiz
Q: Ном хадгалах үед `reviews.2.rating` path дээр ValidationError гарч унав. Энэ юуг хэлж байна вэ?
- [ ] Collection-ы гурав дахь ном буруу байна
- [x] Энэ номын `reviews` array-ийн гурав дахь review-ийн `rating` буруу байна
- [ ] Schema-д rating field байхгүй байна
> Алдааны path array index-тэй хамт ирдэг тул user-д жагсаалтын аль элемент буруу байгааг яг зааж өгч чадна.
```
