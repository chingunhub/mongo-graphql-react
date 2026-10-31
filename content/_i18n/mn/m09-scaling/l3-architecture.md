---
title: Том codebase-ийн архитектур (мөн түүнд замаа олох нь)
source: 9f3efd76ead5dc29b368e9dce234c77f0a7c0ac5eb11cc7c1fef6bccf08737d7
---

Энэ хичээл шинэ API-аас илүү **чиг баримжаа** тухай. Карьерийнхаа ихэнх хугацаанд чи өөрийнхөө бичээгүй код дээр ажиллана, бүгдийг нь унших боломжгүй том код дээр. Гол ур чадвар гурав: аливаа зүйл *хаана байх ёстойг* мэдэх, тэнд байхгүй бол анзаарах, зан төлөвийг schema-аас database хүртэл хурдан мөрдөх. Taskforge одоо дасгал хийхэд хангалттай том боллоо.

## Layer-ууд ба тус бүрт юу харьяалагдах вэ

```viz-flow
{
  colWidth: 200,
  rowHeight: 72,
  nodes: [
    { id: 'schema', label: 'Schema (SDL)', sub: 'contract', col: 0, row: 0, color: 'gql' },
    { id: 'res', label: 'Resolvers', sub: 'хөрвүүлнэ + user шаардана', col: 0, row: 1, color: 'gql' },
    { id: 'svc', label: 'Services', sub: 'business дүрэм + эрх шалгах', col: 0, row: 2, color: 'forge' },
    { id: 'repo', label: 'Repositories / models', sub: 'өгөгдөл рүү хандах', col: 0, row: 3, color: 'mongo' },
    { id: 'db', label: 'MongoDB', col: 0, row: 4, color: 'mongo' },
    { id: 'ctx', label: 'Context', sub: 'user, loaders', col: 1, row: 1, color: 'neutral' },
    { id: 'err', label: 'formatError', sub: 'error гарах хэсэг', col: 1, row: 0, color: 'neutral' },
  ],
  edges: [
    { from: 'schema', to: 'res' }, { from: 'res', to: 'svc' }, { from: 'svc', to: 'repo' }, { from: 'repo', to: 'db' },
    { from: 'ctx', to: 'res', dashed: true }, { from: 'res', to: 'err', dashed: true },
  ],
  steps: [
    { focus: ['schema'], caption: '**Schema**: client юу асууж болохыг заана. Логикгүй. Систем юу *хийдгийг* мэдэх хэрэгтэй бол эхлээд үүнийг унш.' },
    { focus: ['res', 'ctx'], caption: '**Resolver-үүд**: API-ийн хэлбэр ба domain-ий хэлбэрийн хооронд хөрвүүлнэ (`assigneeId` → `assignee`), user шаардаж, service эсвэл repository дуудаад үр дүнг map хийнэ. Нимгэн байна. Resolver 60 мөр болсон бол логик дээш гоожжээ.' },
    { focus: ['svc'], caption: '**Service-үүд**: дээр нь ямар API суусан ч (REST endpoint, CLI, queue worker) адил байх дүрмүүд. "Зөвхөн owner гишүүн нэмнэ." "Issue устгахад түүний comment-ууд устна." Permission шалгалт энд байна.' },
    { focus: ['repo', 'db'], caption: '**Repository/model**: өгөгдөл хэрхэн хадгалагдаж, query хийгддэг. Filter, index, aggregation. GraphQL, user хоёрыг огт мэдэхгүй.' },
    { focus: ['err'], caption: '**Cross-cutting**: context үүсгэх, error форматлах, logging, loader-ууд. Тус бүр нэг л газарт.' },
  ],
}
```

Үүнийг эрүүл байлгах дүрэм: **хамаарал доошоо заана**. Resolver service-ийг import хийнэ, service repository-г import хийнэ, харин repository resolver-ийг хэзээ ч import хийхгүй. Repository дотор `import { GraphQLError } from 'graphql'` харагдвал layering ялзарч эхэлжээ.

> [!NOTE] Taskforge-ийн шударга буулт
> `services/permissions.ts` `GraphQLError` throw хийдэг (`graphql/errors.ts`-ээр дамжуулан). Энэ нь service API layer-ээс хамаарч байна гэсэн үг. Практик шийдэл, олон жинхэнэ codebase үүнийг хийдэг. Цэвэр хувилбар нь: service-үүд **domain error** (`class ForbiddenError extends Error`) throw хийж, `formatError` тэдгээрийг GraphQL код руу map хийнэ. Тэгвэл нэг service REST controller-ийн ард ч өөрчлөлтгүй ажиллана. Богино зам хаана байгааг, тэр нь үнэхээр *богино зам* гэдгийг мэдэх нь codebase-ийг сайн унших ур чадварын нэг хэсэг.

### Feature folder ба layer folder

Taskforge **layer**-ээр зохион байгуулагдсан (`models/`, `repositories/`, `graphql/resolvers/`). Олон том codebase оронд нь **feature**-ээр зохион байгуулдаг:

```text
features/
  issues/   schema.ts  resolvers.ts  service.ts  repository.ts  model.ts  issues.test.ts
  projects/ schema.ts  resolvers.ts  service.ts  …
```

Аль нь ч буруу биш. Layer нь бүх газарт хамаарах өөрчлөлтийг хөнгөн болгоно ("repository бүрт logging нэм"). Харин feature нь feature-ийн ажлыг хөнгөн болгоно ("issue-тэй холбоотой бүх зүйл нэг folder-т"), мөн layer бүрт ~50 файлаас хэтэрсэн үед илүү сайн scale хийнэ. Шинэ багт орвол аль нь болохыг эхний цагтаа ол: үлдсэн бүхнийг хаанаас хайхыг энэ хэлж өгнө.

## Мөрдөх playbook

Bug report: *"TF board дээр TF-12 issue-ийн comment-ийн тоо буруу байна."* Бараг ямар ч GraphQL codebase дээр ажилладаг зам энэ:

```viz-sequence
{
  actors: [
    { id: 'you', label: 'чи', color: 'neutral' },
    { id: 'client', label: 'client код', color: 'react' },
    { id: 'schema', label: 'schema', color: 'gql' },
    { id: 'res', label: 'resolver', color: 'gql' },
    { id: 'data', label: 'loader / repo', color: 'mongo' },
  ],
  steps: [
    { from: 'you', to: 'client', label: 'аль operation? (network tab / op name)', note: '**1. Operation-ыг ол.** Browser-ийн network tab дээр request body-д `operationName` байдаг, жишээ нь `ProjectBoard`. Client кодоос үүнийг хай. Одоо холбогдох яг field-үүдийг мэдэж байна: `commentCount`.' },
    { from: 'you', to: 'schema', label: 'grep "commentCount"', note: '**2. Schema дотроос field-ийг ол.** Аль type дээр? Argument-тэй юу? Nullable юу? `Issue.commentCount: Int!`.' },
    { from: 'you', to: 'res', label: 'Issue: { commentCount }', note: '**3. Resolver-ийг ол.** Convention-оор аль нэг resolver map дахь `Issue` key. Байхгүй бол энэ нь **default resolver**, тэгэхээр *parent* resolver ямар object буцаасныг хар.' },
    { from: 'you', to: 'data', label: 'ctx.loaders.commentCountByIssue', note: '**4. Доош дага.** Loader, service эсвэл repository руу. Ихэвчлэн bug энд байдаг: filter, дутуу ObjectId cast, зөрсөн batch function.' },
    { from: 'you', to: 'you', label: 'нэг operation-аар давт', note: '**5. Тусад нь давт.** Зөвхөн тэр operation-ыг local server дээр ажиллуул (тест дотор `executeOperation`, эсвэл sandbox). Засаад, үүнийг барих тест нэмвэл дууслаа.' },
  ],
}
```

Зан төлөв хаанаас ч үгүй гарч ирсэн юм шиг санагдвал шалгах бас хоёр газар:

- **Context function**: user чинь чиний бодсон user мөн үү? Loader-ууд хуваалцагдах ёсгүй газар хуваалцагдаж байна уу?
- **Plugin, middleware, `formatError`, model hook-ууд**: хэн ч дуудахгүйгээр ажилладаг зүйлс. (Өгөгдлийг чимээгүй filter хийдэг Mongoose `pre(/^find/)` hook бол "query зөв, гэтэл үр дүн дутуу" гэсэн асуудлын алдартай шалтгаан.)

## Abstract type: interface ба union

Том schema-д *хэд хэдэн type-ын аль нэгийг* буцаадаг field байдаг. Taskforge удахгүй нэгийг авна: project, issue, хүмүүсийг нэг дор хайдаг глобал search box.

```graphql
union SearchResult = Project | Issue | User

extend type Query {
  search(term: String!): [SearchResult!]!
}
```

Client type-д хамаарах field-үүдийг **inline fragment**-ээр асууна:

```graphql
{
  search(term: "log") {
    __typename
    ... on Issue { key title }
    ... on Project { key name }
    ... on User { name }
  }
}
```

Server үр дүн бүр ямар тодорхой type болохыг `__resolveType`-аар GraphQL-д хэлж өгнө:

```ts
SearchResult: {
  __resolveType(obj) {
    if (obj instanceof Issue) return 'Issue';
    if (obj instanceof Project) return 'Project';
    if (obj instanceof User) return 'User';
    return null; // → error: abstract type must resolve to an object type
  },
},
```

(`instanceof` Mongoose document дээр ажиллана. Lean object дээр өөр шинж хэрэгтэй: зөвхөн нэг type-д байдаг field, эсвэл өөрөө тавьсан `__typename`.)

**Interface** бол type-ууд нийтлэг field-тэй үед ижил санаа:

```graphql
interface Node { id: ID! }
type Issue implements Node { id: ID!  title: String! }
type Project implements Node { id: ID!  name: String! }
```

Interface үүнийг баталгаажуулдаг тул client fragment-гүйгээр `id`-г сонгож чадна. Relay-ийн `Node` interface (`node(id: ID!): Node`) бол алдартай жишээ.

## Production schema-д таарах хамгаалалтууд

- **Query depth / complexity limit**: хэн нэгэн `project { issues { project { issues { project { … } } } } }` гэж 20 түвшин гүн query явуулна. Library-ууд өртгийн төсвөөс хэтэрсэн query-г татгалзана.
- **Persisted query**: client бүтэн текстийн оронд урьдчилан бүртгэсэн query-ийн hash явуулдаг. Server зөвхөн мэдэгдэж буй query-г ажиллуулна.
- **Log болон metric дэх operation name**: тэгснээр "удаан request" нь "`ProjectBoard` удаан" болно.

Эдгээрийг энд бүтээхгүй, гэхдээ codebase-ийн server setup дотор харахдаа таниж чаддаг байх хэрэгтэй.

```quiz
Q: `Issue`-ийн resolver файл 400 мөр, дотроо MongoDB filter бүтээх болон "хэн устгаж болох" дүрэмтэй. Хамгийн зөв refactor юу вэ?
- [ ] Хоёр resolver файл болгон хуваах
- [x] Filter-үүдийг repository руу, permission дүрмүүдийг service руу шилжүүлж, resolver-ийг хөрвүүлэлтэд үлдээх
- [ ] Бүгдийг model-ийн static болгон шилжүүлэх
> Layer бүр өөрийн ажилтай. Filter бол өгөгдөл рүү хандах ажил, permission дүрэм бол хэд хэдэн mutation-ы хуваалцдаг business дүрэм, харин resolver хөрвүүлнэ.
```

```quiz
Q: `search` `[SearchResult!]!` буцаадаг, Mongoose User document ирлээ. `__resolveType`-гүй бол юу болох вэ?
- [ ] GraphQL field-үүдээс нь таана
- [x] Алдаа: abstract type runtime дээр object type болж resolve хийгдэх шаардлагатай
- [ ] Union-ы эхний type болгон буцаана
> GraphQL JS object-ийг хараад schema-ийн аль type болохыг мэдэж чадахгүй. `__resolveType` (эсвэл type бүр дээрх `isTypeOf`) түүнд хэлж өгнө.
```
