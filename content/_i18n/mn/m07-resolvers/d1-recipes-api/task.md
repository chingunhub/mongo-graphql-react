---
title: "Drill: Mongoose дээрх recipes API"
summary: Жинхэнэ model дээрх resolver-үүд — lean object, огноо, буруу id, NOT_FOUND алдаа.
source: e729e3afde753a236e57fb410598a8d8a6bc2b59f6083bdcb8e854e19d9012a0
---

Module 1-ийн recipe app-д GraphQL API нэмэгдэж байна. Model ба schema бэлэн, хоёуланг нь унш. Resolver болон server factory-г чи бичнэ.

Хичээлд үзсэн дөрвөн урхи бүгд энд хүлээж байна. Чи олохгүй бол тестүүд олно.

## Даалгавар

`graphql/resolvers.ts`-д:

- **`Query.recipes(tag, maxMinutes)`** — хоёулаа заавал биш. `minutes`-аар, дараа нь `title`-ээр sort хий. Энд **`.lean()`** ашигла (жагсаалтын endpoint учраас баг хөнгөн байлгахыг хүсч байна) — мөн бүх зүйл өмнөх шигээ resolve болж байгаа эсэхийг шалга.
- **`Query.recipe(id)`** — recipe-ийг буцаана, эсвэл байхгүй **буюу `id` нь буруу ObjectId бол** `null` (`CastError` гадагш гарахгүй).
- **`Recipe.id`**, **`Recipe.createdAt`** (ISO-8601 string), **`Recipe.ingredientCount`** — эдгээрийг document-д ч, lean object-д ч ажиллуул.
- **`Mutation.addRecipe(input)`** — recipe үүсгээд буцаа. `tags` ба `ingredients`-ийг орхиж болно.
- **`Mutation.addIngredient(recipeId, ingredient)`** — ingredient-ийг atomic байдлаар (recipe-ийг урьдчилан ачаалалгүйгээр) нэмээд **шинэчлэгдсэн** recipe-ийг буцаа. Олдохгүй recipe бол `Recipe not found` message-тэй, `extensions.code` нь `NOT_FOUND` байх `GraphQLError` throw хий.
- **`Mutation.deleteRecipe(id)`** — recipe устгагдсан бол `true`, устгах зүйл байгаагүй бол `false` буцаа.

`server.ts`-д: **`createServer()`** нь schema болон чиний resolver-үүдтэй `ApolloServer` буцаана.

## Hints

### lean + id + огноо
`.lean()`-тай бол `recipe.id` байхгүй, `createdAt` нь `Date` байдаг. `id: (r) => String(r._id)` ба `createdAt: (r) => r.createdAt.toISOString()` шиг resolver-үүд хоёр хэлбэрийн аль алинд нь ажиллана.

### "Query was already executed"
Хичээлийн эхэнд үзсэн урхи энэ: resolver Promise-ийн оронд Mongoose Query буцаасан байна. Chain-ээ `.exec()`-ээр төгсгө, эсвэл resolver-ийг `async` болгоод query-г `await` хий.

### Буруу id
Query хийхээс өмнө `mongoose.isValidObjectId(id)`-г дууд. `addIngredient` ба `deleteRecipe`-ийн хувьд буруу id нь зүгээр л "олдсонгүй" гэсэн үг.

### Atomic append
`Recipe.findByIdAndUpdate(recipeId, { $push: { ingredients: ingredient } }, { returnDocument: 'after', runValidators: true })` нь тохирох зүйл олдоогүй бол `null` буцаана. `deleteOne`-ий буцаадаг зүйл бол `{ deletedCount }`.
