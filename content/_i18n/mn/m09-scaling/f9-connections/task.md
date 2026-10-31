---
title: "Taskforge: connection ба хайлт"
summary: Cursor-оор хуудасладаг issueConnection-г issues-ийн хажууд нэмнэ (schema хөгжүүлэлт), мөн __resolveType-тэй search union.
source: 7f65c205e9cbff8d911f408adc17eaf0b9fc6fab31779773aff58629cde7185e
---

Part III дахь React board хоёр feature дээр тулгуурладаг:

1. Board-д зориулсан **infinite scroll** → `Project.issueConnection(filter, first, after)`, Relay хэв маягийн connection. Одоо байгаа `issues` field-ийн **хажууд** нэмнэ, тиймээс одоо ажиллаж байгаа юу ч эвдрэхгүй.
2. **Глобал хайлтын хайрцаг** → project, issue, хүмүүсийн холимог буцаадаг `search(term)`: **union**.

Энэ алхам жинхэнэ feature шиг codebase-ийн хэд хэдэн газрыг хөндөнө: шинэ файлууд, мөн байгаа файлуудад жижиг засвар (schema болон resolver-ийг бүртгэх, model дээр index). Хэсэг бүр аль файлд хамаарахыг олох нь дасгалын нэг хэсэг.

## Даалгавар

### 1. Schema (шинэ файлууд, дараа нь `schema/index.ts`-д бүртгэ)

`schema/pagination.ts`:
```graphql
type PageInfo { hasNextPage: Boolean!  endCursor: String }
type IssueEdge { cursor: String!  node: Issue! }
type IssueConnection { edges: [IssueEdge!]!  pageInfo: PageInfo!  totalCount: Int! }
```
…мөн **`Project`-ийг extend хий**: `issueConnection(filter: IssueFilter, first: Int = 20, after: String): IssueConnection!`.

`schema/search.ts`: `union SearchResult = Project | Issue | User` ба `extend type Query { search(term: String!): [SearchResult!]! }`.

### 2. `server/graphql/pagination.ts`
- `encodeCursor(issue)` / `decodeCursor(cursor)` — opaque, `createdAt` **болон** `_id`-г хоёуланг нь кодлоно; буруу cursor → `BAD_USER_INPUT`.
- `issueConnection(projectId, filter, { first, after })`:
  - хамгийн шинэ нь эхэнд (`createdAt` desc, `_id` desc), `issues`-тэй ижил filter-үүд (repository-оосоо `buildIssueFilter`-ийг дахин ашигла),
  - `first` нь 1–50 хооронд (үгүй бол `BAD_USER_INPUT`), `hasNextPage`-д limit+1,
  - `totalCount` нь filter-д таарах бүх issue-г тоолно, гэхдээ зөвхөн client **асуусан үед** (үгүй бол count query гарахгүй).

Дараа нь үүнийг дууддаг `Project.issueConnection` resolver-ийг (`resolvers/project.ts` дотор) нэм.

### 3. `server/models/Issue.ts`
`{ project: 1, createdAt: -1, _id: -1 }` дээр index нэм. Энэ нь яг энэ query-д үйлчилнэ.

### 4. Search (`resolvers/search.ts`, дараа нь `resolvers/index.ts`-д бүртгэ)
- `search(term)`: trim хийсэн хайлтын үг дор хаяж 2 тэмдэгттэй байна (`BAD_USER_INPUT`: `Search term must be at least 2 characters`). Том жижиг үсгийг ялгахгүй, хайлтын үгийг шууд агуулсан эсэхээр таарна (escape хий!):
  - `name` эсвэл `key` нь таарсан **project** 5 хүртэл, name-ээр sort хийж,
  - `title` нь таарсан **issue** 5 хүртэл, хамгийн шинэ нь эхэнд,
  - `name` нь таарсан **user** 5 хүртэл, name-ээр sort хийж,
  - энэ дарааллаар буцаана: эхлээд project, дараа нь issue, дараа нь user.
- `SearchResult.__resolveType` — үр дүн бүр ямар type болохыг GraphQL-д хэл.

## Hints

### Залхуу totalCount
Default resolver нь parent-ийн property function бол түүнийг **дууддаг** (Module 6). Тэгэхээр connection object `totalCount: () => countIssues(projectId, filter)` барьж болно. Энэ нь зөвхөн `totalCount` сонгогдсон үед л ажиллана.

### Cursor-ыг filter-тэй нэгтгэх
`buildIssueFilter` аль хэдийн зарим key ашиглаж магадгүй, тиймээс хоёуланг нь ороо: `{ $and: [buildIssueFilter(projectId, filter), cursorCondition] }`. Буурах (createdAt, _id) sort-ын cursor нөхцөл: `{ $or: [{ createdAt: { $lt: C } }, { createdAt: C, _id: { $lt: I } }] }`.

### __resolveType
`if (obj instanceof Issue) return 'Issue';` гэх мэтээр, model class-уудыг `server/models`-оос import хийнэ.
