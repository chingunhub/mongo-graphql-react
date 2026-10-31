---
title: "Drill: Борлуулалтын тайлан"
summary: Aggregation дээр $unwind, тооцоолсон field, давхардаагүй тоолол, огнооны хүрээ ба $lookup.
source: 21b327f77ecb08c70931a6f0bf7e89d0ead4fd39003403baf56a21aa610316c7
---

Санхүүгийн баг dashboard дээрээ хоёр тоо хүсэж байна. Хоёуланг database дотор тооцоолно. Сая сая order байгаа тул Node руу татах аргагүй.

Эхлээд `models/Order.ts`-ийг унш. Order-д `customer` (reference), `status` (`PAID` эсвэл `REFUNDED`), `createdAt` байна. Мөн **embed хийсэн line item-үүд** байна: `{ sku, category, qty, price }`.

## Даалгавар

`reports/sales.ts` дотор:

### `revenueByCategory(from, to)`

`[from, to)` хүрээнд үүссэн (from орно, to орохгүй) **төлөгдсөн** order-уудыг item-ийн category тус бүрээр гарга:

```ts
[
  { category: 'keyboards', revenue: 534, units: 6, orders: 2 },
  { category: 'cables', revenue: 45, units: 3, orders: 2 },
]
```

- `revenue` — тухайн category-ийн line item бүрийн `qty × price`-ийн нийлбэр
- `units` — `qty`-ийн нийлбэр
- `orders` — тухайн category-ийн дор хаяж нэг item агуулсан **давхардаагүй order**-ийн тоо (хоёр keyboard line-тай order нэг удаа тооцогдоно)
- `revenue`-ээр буурахаар sort хийгдсэн. Яг эдгээр дөрвөн key, `_id` байхгүй.

### `topCustomers(limit = 3)`

**Төлөгдсөн** order дээр бүх хугацаанд хамгийн их зарцуулсан customer-ууд. Нэрийг нь `customers` collection-оос авна:

```ts
[
  { customerId: '66f…', name: 'Kai Ito', spent: 579, orders: 2 },
  …
]
```

`customerId` нь **string**. `spent`-ээр буурахаар sort хийгдсэн.

## Hints

### Line item-үүдийг unwind хийх
Revenue line item бүрээр тооцогддог тул `$match`-ийн дараа `$unwind: '$items'` хий. Гарсан document бүр нэг `items` object-той. `$sum`-ын дотор `{ $multiply: ['$items.qty', '$items.price'] }`-аар тооц.

### Category бүрийн давхардаагүй order-ууд
Бүлэг бүрт order-ийн id-г `$addToSet: '$_id'`-аар цуглуул (order-ийн `_id` `$unwind`-ийн дараа ч хэвээр үлддэг). Дараа нь `$project` дээр `{ $size: '$orderIds' }`-аар тэр set-ийн хэмжээг тоо болго.

### Customer-уудыг холбох
`'$customer'`-ээр бүлэглэж, sort ба limit хийсний дараа `$lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' }` хий, дараа нь `$unwind: '$customer'`. `$project` дээр `{ $toString: '$_id' }` id-г string болгоно.
