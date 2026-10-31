---
title: GraphQL үнэндээ юу вэ
source: e8649b768451f3042027568cc98f70ba43b07c8fe7a76c2a93e37941819592ea
---

Чамд одоо data layer бий. Part II түүний урд API тавина. Server код бичихээс өмнө GraphQL *юу болохыг* тодорхой болгоё. Үүнийг ихэвчлэн "илүү сайн REST" гэж тайлбарладаг, гэвч энэ нь хагас л үнэн, мөн хачин дизайн руу хөтөлдөг.

GraphQL гэдэг гурван зүйл:

1. **Query language**: client-ууд өгөгдөл асуухад хэрэглэнэ. Яг хэрэгтэй field-үүдээ, хэрэгтэй хэлбэрээр нь авна.
2. **Type system**: server өөрийн өгч чадах бүх зүйлээ үүгээр дүрсэлнэ. Үүнийг **schema** гэнэ.
3. **Execution model**: server query ба schema-г аваад, **resolver** гэж нэрлэдэг жижиг function-уудыг дуудаж үр дүнг гаргадаг.

Энэ хичээл эхний зүйлийн тухай. Дараагийн хоёр хичээл 2, 3-р зүйлийг авна.

> [!BRIDGE]
> REST API дээр URL бүр нэг асууж болох зүйл: `GET /projects/TF`, дараа нь `GET /projects/TF/issues?limit=2`, тэгээд assignee бүрт өөр нэг дуудлага. GraphQL ихэвчлэн нэг URL-тай, `POST /graphql`, харин хүссэн зүйлээ request body хэлнэ. Route-ууд алга болоогүй, юу асууж болохыг жагсаасан жагсаалт чинь router-оос schema руу нүүсэн.

## Request-ийн хэлбэр нь response-ийн хэлбэр

Ажиллаж буй жишиг Taskforge API-д илгээсэн query ба буцаж ирсэн хариу:

```compare
--- query (graphql)
query {
  project(key: "TF") {
    name
    issues(limit: 2) {
      key
      title
      assignee {
        name
      }
    }
  }
}
--- response (json)
{
  "data": {
    "project": {
      "name": "Taskforge",
      "issues": [
        { "key": "TF-24", "title": "Keyboard shortcuts",
          "assignee": { "name": "Grace Hopper" } },
        { "key": "TF-23", "title": "Export to CSV",
          "assignee": null }
      ]
    }
  }
}
```

Хоёуланг зэрэгцүүлж унш. Чиний бичсэн field бүр response-д яг ижил nesting-ээрээ гарч ирнэ, өөр юу ч гарахгүй. GraphQL-ийг ашиглахад хамгийн гол нь энэ толь шиг шинж: **client tree дүрсэлнэ, server түүнийг дүүргэнэ.**

Туршаад үз, энэ жинхэнэ server. `title`-ийн доор `status` нэм, эсвэл `assignee`-г хас, дараа нь дахин ажиллуул:

```graphql-try
query {
  project(key: "TF") {
    name
    issues(limit: 2) {
      key
      title
      assignee {
        name
      }
    }
  }
}
```

## Яагаад зүгээр л REST биш вэ?

Taskforge-ийн board хуудсыг REST API-тай гэж төсөөл. Түүнд project, түүний issue-ууд, issue бүрийн assignee хэрэгтэй:

```viz-sequence
{
  title: 'REST: board хуудас',
  actors: [
    { id: 'ui', label: 'Board хуудас', color: 'react' },
    { id: 'api', label: 'REST API', color: 'neutral' },
  ],
  steps: [
    { from: 'ui', to: 'api', label: 'GET /projects/TF', note: 'Project object-ыг бүтнээр нь буцаана: description, settings, owner-ийн мэдээлэл… board-д зөвхөн name хэрэгтэй. **Over-fetching.**' },
    { from: 'api', to: 'ui', label: '200 { …40 field }', ret: true },
    { from: 'ui', to: 'api', label: 'GET /projects/TF/issues', note: 'Хоёр дахь round trip, учир нь эхний response-д issue-ууд ороогүй. **Under-fetching.**' },
    { from: 'api', to: 'ui', label: '200 [ …24 issue ]', ret: true, note: 'Issue-ууд assignee-ийн нэр биш, `assigneeId` агуулсан байна…' },
    { from: 'ui', to: 'api', label: 'GET /users?ids=…', note: '…тэгэхээр гурав дахь request. Эсвэл хэн нэгэн endpoint-д `?include=assignee` нэмнэ, дараа нь `?include=assignee,labels`, тэгээд endpoint аажмаар хэн ч төлөвлөөгүй query language болж хувирна.' },
    { from: 'api', to: 'ui', label: '200 [ …user-ууд ]', ret: true },
  ],
}
```

```viz-sequence
{
  title: 'GraphQL: board хуудас',
  actors: [
    { id: 'ui', label: 'Board хуудас', color: 'react' },
    { id: 'api', label: 'GraphQL API', color: 'gql' },
  ],
  steps: [
    { from: 'ui', to: 'api', label: 'POST /graphql { project { name issues { … assignee { name } } } }', note: 'Хуудсанд хэрэгтэй бүх tree-г дүрсэлсэн нэг request.' },
    { from: 'api', to: 'ui', label: '200 { data: { project: … } }', ret: true, note: 'Яг тэр tree-тэй нэг response. Хуудас өөрчлөгдөхөд өөрчлөгдөх нь *query*. Шинэ endpoint ч, backend deploy ч хэрэггүй.' },
  ],
}
```

Энэ талаар хоёр талын санал сонсоно, тиймээс trade-off-уудыг шударгаар нь харъя:

| | REST | GraphQL |
| --- | --- | --- |
| Нэг screen-д хэрэгтэйг татах | хэд хэдэн endpoint, эсвэл тусгайлан бичсэн endpoint | нэг query, client шийднэ |
| HTTP caching (CDN, browser) | байгалийн (GET + URL) | хэцүү (ихэвчлэн POST), оронд нь client-ууд cache хийнэ |
| Typed contract | заавал биш (OpenAPI) | суулгасан, introspect хийж болно |
| Server талын төвөгтэй байдал | endpoint тус бүр дээр хялбар | resolver-үүд, N+1 эрсдэл, query-ийн зардлын хязгаар |
| Error | HTTP status code | ихэвчлэн `200` ба `errors` array |

GraphQL нь олон өөр screen (эсвэл олон өөр client) ижил холбоотой өгөгдлийн өөр өөр хэсгийг хүсэх үед хамгийн сайн ажиллана. Том codebase болж өргөждөг app яг ийм байдаг.

## Request-ийн бүтэц

Дотор нь уйтгартай энгийн HTTP. Operation бүр нэг endpoint руу JSON body-той `POST` болж очно:

```json title="POST /graphql"
{
  "query": "query ProjectBoard($key: String!) { project(key: $key) { name } }",
  "variables": { "key": "TF" },
  "operationName": "ProjectBoard"
}
```

Харин response бол хамгийн ихдээ хоёр top-level key-тэй JSON:

```json
{
  "data": { "project": { "name": "Taskforge" } },
  "errors": [ /* only if something went wrong */ ]
}
```

Тийм, `data` ба `errors` **хоёулаа** байж болно: GraphQL хэсэгчилсэн үр дүн буцааж чадна. Үүнийг сайн хийх тухай Module 8-д орно.

## Operation-ууд: query, mutation, subscription

```graphql
query ProjectBoard { ... }      # read
mutation CreateIssue { ... }    # write
subscription IssueUpdated { ... } # server pushes over a socket (not covered here)
```

Хурдан нэг өгөгдөл уншихад `query` keyword ч, нэр ч заавал биш (`{ projects { name } }` ажиллана). Гэхдээ жинхэнэ кодонд **operation-ууддаа үргэлж нэр өг**. Нэр нь server log, Apollo-ийн dev tools, error report дээр харагдана. `ProjectBoard failed` гэвэл debug хийж болно, `anonymous query failed` гэвэл болохгүй.

## Variable-ууд: query string бүү угсар

User-ийн оруулсан утгыг query string-тэй залгаад `project(key: "TF")` гэж бичиж *болно*. Гэхдээ бүү хий, SQL-ийг string залгаж бүтээдэггүйтэй ижил шалтгаантай. **Variable**-уудаа type-тай нь зарлаад, утгуудыг тусад нь дамжуул:

```graphql-try
query ProjectBoard($key: String!, $limit: Int = 3) {
  project(key: $key) {
    name
    issues(limit: $limit) {
      key
      title
    }
  }
}
---variables---
{ "key": "TF", "limit": 2 }
```

`$key: String!` нь заавал байх string variable зарлаж, `$limit: Int = 3` нь default-той. Server юу ч ажиллуулахаас *өмнө* variable-ийн утгуудыг эдгээр type-тай тулгаж validate хийнэ. `"limit": "two"` болгож үзээд юу ирэхийг хар.

## Alias ба fragment-үүд

**Alias** нь response дахь field-ийн нэрийг солино. Ингэснээр ижил field-ийг өөр argument-аар хоёр удаа асууж болно:

```graphql-try
query {
  todo: project(key: "TF") {
    issueCount(filter: { status: TODO })
  }
  done: project(key: "TF") {
    issueCount(filter: { status: DONE })
  }
}
```

**Fragment** бол дахин ашиглах selection. Нэр өгч, нэг type-д холбоно:

```graphql
fragment IssueSummary on Issue {
  key
  title
  status
  assignee { name }
}

query {
  project(key: "TF") {
    issues(limit: 5) { ...IssueSummary }
  }
}
```

Server талд fragment бол зүгээр л copy-paste. Client талд бол архитектурын хэрэгсэл: React component бүр *өөртөө* хэрэгтэй өгөгдлийн fragment-ийг зарлаж, хуудас эдгээрийг нэгтгэнэ. Энэ нь Module 12-т орно.

## Schema өөрийгөө тайлбарладаг

GraphQL server бүр өөрийн schema-н тухай асуултад хариулж чадна, үүнийг **introspection** гэнэ. Apollo Sandbox шиг tool-ууд query-г чинь ингэж autocomplete хийдэг:

```graphql-try
query {
  __type(name: "Issue") {
    fields {
      name
      type { name kind ofType { name } }
    }
  }
}
```

Мөн дурын object өөрийн type-ын нэрийг `__typename`-ээр хэлж чадна. Энэ нь Apollo Client-ийн cache-д маш чухал болно:

```graphql-try
query {
  projects { __typename key }
}
```

```quiz
Q: Client `{ project(key: "TF") { name } }` илгээв. Response-ийн `data` юу агуулах вэ?
- [ ] MongoDB-д хадгалагдсан project document-ыг бүтнээр нь
- [x] `{ "project": { "name": "…" } }`, зөвхөн асуусан зүйл
- [ ] Project болон `id` шиг default field-үүд
> Response selection-ийг яг толь шиг дагана. Query асуугаагүй field огт гарахгүй, `id` ч гэсэн.
```

```quiz
Q: Production код яагаад утгуудыг query string-д шууд бичихийн оронд variable хэрэглэх вэ?
- [ ] Variable-ууд parse хийхэд илүү хурдан
- [x] Утгууд зөвхөн өгөгдөл хэвээр үлдэнэ (type-тай, validate хийгдсэн, injection-оос хамгаалагдсан), харин query-ийн текст тогтмол тул cache хийж болно
- [ ] Server literal argument-ыг reject хийдэг
> Literal argument бол хүчинтэй GraphQL. Гэхдээ user-ийн оруулсан утгаас query string угсрах нь injection маягийн bug-ыг урина, харин тогтмол query текст нь server болон client-д parse хийсэн document-ыг cache хийх боломж өгнө.
```
