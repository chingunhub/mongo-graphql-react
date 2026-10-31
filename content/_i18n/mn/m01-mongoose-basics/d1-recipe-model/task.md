---
title: "Drill: Recipe model"
summary: Анхны schema-гаа, мөн Book жишээнээс нэг алхам цааш явдаг query-ууд.
source: ce5f72233be46b373a376332f723a1f1a44bc0afbace41dae14d28dcfd94d779
---

Recipe app-ын data layer-ийг чи бичнэ. Bookshelf жишээтэй ижил алхмууд: schema, model, хэдэн query function. Харин function бүр жишээнд үзээгүй нэг зүйлийг шаарддаг.

## Даалгавар

`models/Recipe.ts`-д:

### 1. Schema ба model

| Field | Дүрэм |
| --- | --- |
| `title` | string, **required**, trim хийгдсэн |
| `minutes` | number, **required** |
| `tags` | string-үүдийн array, **tag бүр** trim, lowercase хийгдэнэ (`" Vegan "` → `"vegan"`) |
| `vegetarian` | boolean, default нь `false` |

`createdAt`/`updatedAt` timestamp нэмээд, model-оо `Recipe` нэрээр export хий (model name `'Recipe'`).

### 2. `createRecipe(data)`

Хадгалагдсан recipe document-ыг үүсгээд буцаа.

### 3. `findQuickRecipes(maxMinutes)`

`maxMinutes`-аас **хэтрэхгүй** хугацаанд хийгддэг recipe-үүдийг буцаа:

- `minutes`-аар өсөхөөр, ижил хугацаатай нь `title`-ээр A→Z дарааллаар sort хий;
- үр дүн бүр **энгийн object** (Mongoose document биш), яг **хоёр key**-тэй: `title` ба `minutes`. `_id` орохгүй.

### 4. `countVegetarian()`

Энэ function vegetarian recipe-үүдийн **тоо**гоор resolve болно. Document-уудыг ачаалаад тоолох хэрэггүй: model дээр MongoDB-ээс зөвхөн тоог асуух `countDocuments(filter)` method бий.

Playground дээр туршаад үз. Database run бүрт шинээр эхэлдэг.

## Hints

### Array element options
`[String]` бол энгийн string-үүдийн array-ийн товчлол. *Element* бүрт тохиргоо өгөхдөө array-ийн хаалтан дотор options object тавь: `[{ type: String, ... }]`.

### Хоёр key-ээр sort хийх ба "дээд тал нь"
"Дээд тал нь" гэдэг нь `$lte` гэсэн үг. `sort()` нэгээс олон key-тэй object хүлээн авдаг. Дараалал чухал: эхний key sort хийж, тэнцсэн үед хоёр дахь нь шийднэ: `{ minutes: 1, title: 1 }`.

### Яг хоёр key
`.select()` нь `_id`-г хасаагүй л бол оруулчихдаг. Field-үүдийг оруулах хэлбэрт зөвхөн `_id`-г хасаж холиж болно: `.select('title minutes -_id')` эсвэл `.select({ title: 1, minutes: 1, _id: 0 })`. Дараа нь `.lean()` document-уудыг энгийн object болгодог.
