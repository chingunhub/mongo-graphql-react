---
title: "Drill: race condition-гүй inventory"
summary: Atomic $inc, хэт зарахаас татгалздаг нөхцөлт update-ууд, $addToSet, мөн validate хийгдсэн $set.
source: 81b9bf9f2549146b28d6ebcc0be82e2276a886d4817d15c8350b44fa281c5efd
---

Дэлгүүрийн checkout олон server дээр зэрэг ажилладаг. Нээлтийн өдөр 200 хүн нэг секундэд бүтээгдэхүүний сүүлийн 5 ширхгийг авах гэж оролдоно. Чиний inventory function-ууд хэт зарахыг "магадлал багатай" биш, **боломжгүй** болгох ёстой.

`Product` model `models/Product.ts`-д бэлэн байгаа (`sku`, `name`, `min: 0`-тэй `stock`, `min: 0`-тэй `price`, мөн lowercase `tags`).

## Даалгавар

`repositories/inventory.ts`-д:

- **`restock(sku, qty)`** — `qty`-г stock-д **atomic байдлаар** нэмээд, шинэ stock-ийн тоогоор resolve болно. Тэр SKU-тай бүтээгдэхүүн байхгүй бол `null`-аар resolve болно. `qty` эерэг бүхэл тоо байх ёстой, үгүй бол database-д хүрэхээсээ өмнө `Error` throw хий.
- **`sell(sku, qty)`** — `qty`-г stock-оос **зөвхөн хангалттай бол** хасна, нэг atomic operation-оор. Борлуулалт болсон бол `true`, үгүй бол (stock хүрэлцэхгүй эсвэл олдоогүй SKU) `false`-аар resolve болно. Stock 5 байхад `sell(sku, 1)`-ийг 10 удаа зэрэг дуудвал яг 5 нь амжилттай болж, stock эцэст нь 0 болох ёстой.
- **`addTag(sku, tag)`** — tag-ыг нэмнэ, гэхдээ аль хэдийн байвал нэмэхгүй (schema tag-уудыг lowercase болгодог тул `'Sale'` ба `'sale'` нь ижил tag). Шинэчлэгдсэн бүтээгдэхүүнээр resolve болно, эсвэл `null`.
- **`setPrice(sku, price)`** — үнийг update query-ээр тохируулаад, **шинэчлэгдсэн** бүтээгдэхүүнээр resolve болно (эсвэл `null`). Сөрөг үнэ ValidationError-оор **reject хийгдэх** ёстой. Schema дээр `min: 0` байгаа ч, update query default-оор validator-тай яаж харьцдагийг санаарай.

SKU том үсгээр хадгалагддаг. Model-ийн setter filter дээр ч үүнийг өөрөө зохицуулна.

## Hints

### Atomic тооцоолол
`findOneAndUpdate({ sku }, { $inc: { stock: qty } }, { returnDocument: 'after' })` нь уншиж, бичих ажлыг нэг алхамд хийгээд шинэ document-ийг (эсвэл `null`) өгдөг.

### Хэт зарахгүй байх
Урьдчилсан нөхцлөө **filter**-т тавь: `{ sku, stock: { $gte: qty } }`. Дараа нь `-qty`-ээр `$inc` хий. Юу ч таарахгүй бол stock хүрэлцэхгүй (эсвэл SKU байхгүй) гэсэн үг. `updateOne` энийг `modifiedCount`-аараа чамд хэлнэ. `runValidators`-д бүү найд: энэ нь `$inc`-ийг шалгадаггүй.

### Validate хийгдсэн $set
`findOneAndUpdate`-д `{ runValidators: true, returnDocument: 'after' }`-ийг дамжуул. Давхардлыг алгасдаг operator бол `$addToSet`.
