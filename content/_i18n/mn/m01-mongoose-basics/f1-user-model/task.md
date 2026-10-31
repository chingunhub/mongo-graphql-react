---
title: "Taskforge: User model"
summary: Capstone codebase-ийн анхны файл.
source: 08ed7e463d97260ca22613c3c8d07081633aafe3707883d666f5a97eef7e24b6
---

Taskforge codebase-д тавтай морил. Одоохондоо нэг л файл байгаа. Module 13 гэхэд data layer, GraphQL API, React client-тэй ~30 файлтай full-stack app болно, мөн энд бичсэн **бүх зүйл** цаашаа дагаж явна. Дараагийн forge step-ийг нээхэд `User.ts` чинь яг үлдээснээрээ тэнд байна.

Эцсийн архитектур дотор энэ файл хаана орохыг харъя:

```viz-flow
{
  colWidth: 170,
  rowHeight: 74,
  nodes: [
    { id: 'react', label: 'web/', sub: 'React + Apollo Client', col: 0, row: 0, color: 'react' },
    { id: 'gql', label: 'server/graphql/', sub: 'schema · resolvers', col: 1, row: 0, color: 'gql' },
    { id: 'repo', label: 'repositories/', sub: 'query building', col: 2, row: 0, color: 'mongo' },
    { id: 'models', label: 'server/models/', sub: 'User ← чи энд байна', col: 3, row: 0, color: 'forge' },
  ],
  edges: [
    { from: 'react', to: 'gql', label: 'HTTP' },
    { from: 'gql', to: 'repo' },
    { from: 'repo', to: 'models' },
  ],
}
```

Taskforge-ийн user гэдэг нь issue нээдэг, issue-д assign хийгддэг, дээр нь comment бичдэг хүмүүс. Одоохондоо нэр, email, role гурав л хэрэгтэй.

## Даалгавар

`server/models/User.ts` дотор:

1. **Schema + model**-ийг `User` нэрээр export хий (model-ийн нэр `'User'`):

   | Field | Дүрэм |
   | --- | --- |
   | `name` | string, required, trim хийсэн |
   | `email` | string, required, trim **болон** lowercase хийсэн |
   | `role` | string, `'MEMBER'` эсвэл `'ADMIN'` л байж болно, default нь `'MEMBER'` |

   Үүнээс гадна `createdAt`/`updatedAt` timestamp-ууд.

   Зөвшөөрөгдсөн role-уудыг бусад файл hard-code хийхгүйн тулд `ROLES` нэрээр бас export хий. Утга нь `['MEMBER', 'ADMIN']` array.

2. **`createUser({ name, email, role? })`** — user үүсгээд буцаана.

3. **`findUserByEmail(email)`** — user-ийг буцаана, олдохгүй бол `null`. `"  Ada@Taskforge.DEV "` гэж дуудсан ч `ada@taskforge.dev`-ийг заавал олно. Login form дээр хүн email-ээ дураараа бичдэг шүү дээ.

4. **`listUsers()`** — бүх user, нэрээр A→Z sort хийгдсэн.

Role-ийн дүрэм бол хичээлд үзүүлээгүй зүйл: тогтсон утгуудын аль нэг байх string. Mongoose яг үүнд зориулсан option-той, `ROLES`-ийг schema-д яаж холбохоо бодоод үз.

> [!TIP]
> Email-ийг *хаана* normalize хийхээ бод. `findUserByEmail` дотор lowercase хийж болно… эсвэл schema-д хийлгэж болно, тэгвэл бичихэд **болон** query хийхэд хоёуланд нь ажиллана. Багийн хэн нэгэн codebase-ийн өөр газар `User.findOne({ email })` гэж бичсэн ч энэ хоёрын зөвхөн нэг нь ажилласан хэвээр.

## Hints

### String-ийг тогтсон утгуудаар хязгаарлах
String field-үүд `enum` option авдаг: зөвшөөрөгдсөн утгуудын array. Өөр утга орвол path-ийг нэрлэсэн `ValidationError`-оор validation унана. Export хийсэн `ROLES` array-гаа шууд өгч болно.

### Том жижиг үсэг ялгахгүй хайлт
Хичээлээс санаарай: `lowercase`, `trim` зэрэг setter-ууд **query filter** дээр бас ажиллана. Schema `email`-ийг normalize хийдэг бол `User.findOne({ email })` аль хэдийн normalize хийгдсэн утгаар хайж байгаа юм.

### Sort
`User.find().sort({ name: 1 })`. Filter-гүй `find()` бүгдийг буцаана.
