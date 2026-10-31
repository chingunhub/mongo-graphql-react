---
title: "Drill: Slug ба soft delete"
summary: Зөвхөн хэрэгтэй үед ажилладаг save hook, гарцтай query middleware, мөн method ба static.
source: 9e8c5cd9df79aabd3f16daf252e938fb6b7b8403f1803d9a47f434fa35424ee2
---

Нийтлэл хэвлэдэг app-д `Article` model дээр хоёр боломж хэрэгтэй:

- **Slug.** URL нь `/articles/why-mongo-indexes-matter` шиг харагддаг. Slug-ыг title-ээс автоматаар гаргана.
- **Soft delete.** Editor-ууд нийтлэлээ байнга "устгаад", дараа нь буцааж гуйдаг. Document-ыг жинхэнээр устгахын оронд `deletedAt`-аар тэмдэглээд бүх газраас нуу. Устгагдсаныг хэн нэгэн тусгайлан хүсвэл л харуулна.

`lib/slugify.ts` дотор `slugify` helper бэлэн байгаа.

## Даалгавар

`models/Article.ts` дотор (field-үүд аль хэдийн байгаа):

1. **Slug hook.** Хадгалахаас өмнө `slug = slugify(title)` гэж тавь, гэхдээ **зөвхөн title шинэ эсвэл өөрчлөгдсөн үед**. Зөвхөн body-г засаад хадгалахад slug өөрчлөгдөхгүй. Гадаа тархсан link-үүд ажилласаар байх ёстой.

2. **Soft delete хийсэн нийтлэлүүдийг нуу** — `find`, `findOne`, `findById`, `findOneAndUpdate` **болон** `countDocuments`-оос: `deletedAt` нь null биш бүх document.
   - Гарц: `withDeleted: true` option-оор ажиллуулсан query бүгдийг харна: `Article.find().setOptions({ withDeleted: true })`.

3. **Instance method-ууд**:
   - `article.softDelete()` — `deletedAt`-г одоогийн цагт тавиад хадгална, нийтлэлээр resolve болно.
   - `article.restore()` — `deletedAt`-г буцаагаад `null` болгож хадгална. Нийтлэлээр мөн resolve болно.

4. **Static**: `Article.findBySlug(slug)` — тэр slug-тай (устгаагүй) нийтлэл, эсвэл `null`.

## Hints

### Зөвхөн title өөрчлөгдсөн үед
`pre('save')` hook дотор шинэ document-ын хувьд ч `this.isModified('title')` `true` байдаг. Жирийн `async function () {}` ашигла: arrow function-д `this` ирдэггүй.

### Нэг hook, олон operation
`schema.pre(['countDocuments', /^find/], function () { ... })` нь эдгээр бүгдэд ижил query middleware бүртгэнэ. Дотор нь `this` нь Query: flag-аа `this.getOptions().withDeleted`-ээр уншаад, нөхцөлийг `this.where({ deletedAt: null })`-ээр нэм.

### Method ба static
`articleSchema.methods.softDelete = async function () { ... }` ба `articleSchema.statics.findBySlug = function (slug) { return this.findOne({ slug }); }`. `findBySlug` нь `findOne` ашигладаг тул soft-delete hook түүнд аль хэдийн үйлчилнэ.
