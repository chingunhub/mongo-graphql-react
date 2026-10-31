---
title: "Drill: арга хэмжээний тасалбар"
summary: Built-in болон custom validator-ууд, тэр дундаа хоёр field-ийг харьцуулдаг нэг validator, мөн алдааг field-ийн map болгон хувиргах.
source: b06f75c31ce73a694a26194b4c7a8c82f2f75af6b3d0f2a19b28f2275d5649b6
---

Арга хэмжээний сайтын `Event` model утгагүй өгөгдлөөс татгалзах хэрэгтэй: тэг багтаамжтай өрөө, эхлэхээсээ өмнө дуусдаг арга хэмжээ, хагас суудал. Харин ямар нэг юм буруу бол signup form **аль field**-ийг highlight хийхээ мэдэх хэрэгтэй.

## Даалгавар

`models/Event.ts`-д `Event` model-ийг (нэр нь `'Event'`) export хий, дараах field-үүдтэй:

| Field | Дүрэм | Буруу байвал гарах мессеж |
| --- | --- | --- |
| `title` | string, required, trim хийгдсэн, 3–80 тэмдэгт | хэт богино: `Title must be at least 3 characters` |
| `capacity` | number, required, 1-ээс багагүй, **бүхэл тоо** | бүхэл биш: `Capacity must be a whole number` |
| `price` | number, default нь `0`, сөрөг биш | (default мессеж хангалттай) |
| `startsAt` | date, required | |
| `endsAt` | date, required, `startsAt`-аас **хойно**, тэнцүү байж болохгүй | `Event must end after it starts` |
| `status` | `DRAFT`, `PUBLISHED`, `CANCELLED`-ийн аль нэг; default нь `DRAFT` | |

Дараа нь хоёр function бич:

- **`createEvent(data)`** — event-ийг хадгалаад буцаана. Буруу бол ValidationError throw хийнэ, энэ зүгээр.
- **`checkEvent(data)`** — **юу ч хадгалахгүйгээр** validate хийгээд дараахийн аль нэгээр resolve болно:
  - `{ valid: true }`, эсвэл
  - `{ valid: false, errors: { [path]: message } }` — алдаатай field бүрт нэг entry.

  ```ts
  await checkEvent({ title: 'Hi', capacity: 2.5, startsAt: new Date() /* no endsAt */ });
  // {
  //   valid: false,
  //   errors: {
  //     title: 'Title must be at least 3 characters',
  //     capacity: 'Capacity must be a whole number',
  //     endsAt: 'Path `endsAt` is required.'
  //   }
  // }
  ```

## Hints

### Бүхэл тоо
`Number`-д зориулсан built-in "integer" validator байдаггүй. Custom `validate: { validator, message }` дотор `Number.isInteger(v)` ашиглавал болно.

### Хоёр field-ийг харьцуулах
Validator-ыг `endsAt` дээр тавь. `this` нь document болохын тулд энгийн `function (value) { ... }` хэрэглэ, тэгээд `this.startsAt`-тай харьцуул. Огноог `>`-аар шууд харьцуулж болно. `startsAt` дутуу бол `startsAt` дээрх `required` алдааг аль хэдийн мэдээлчихнэ. Тэр тохиолдолд чиний validator `true` буцааж болно, тэгвэл ойлгомжгүй давхар алдаа гарахгүй.

### Хадгалахгүйгээр validate хийх
`new Event(data)` document-ыг database-д хүрэлгүй бүтээнэ. Ямар нэг дүрэм зөрчигдвөл `await doc.validate()` `ValidationError` throw хийнэ. Түүний `.errors` object-ийн key нь path, entry бүр `.message`-тэй.
