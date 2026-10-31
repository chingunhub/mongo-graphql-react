---
title: "Taskforge: schema-г зохиох"
summary: Product spec-ийг SDL болго. Type, nullability, enum, input, default-той argument-ууд, бүгдийг domain-оор нь файлд хуваана.
source: 879e9c00de2e6ffa95e5e9910b3458b39b3437b40c40b812d5c88f532eaaf075
---

Schema-first гэдэг нь resolver бичихээс өмнө багаараа **contract**-аа тохирчихно гэсэн үг. Доорх product spec-ийг чиний PM, frontend dev хоёр бичсэн. Чиний ажил бол үүнийг SDL болгох, ингэвэл React app (Part III) яг үүн дээр суурилж бичигдэнэ.

Бүтэц нь хичээлийг дагана: domain бүрт нэг файл, тус бүр root-уудыг `extend` хийнэ:

```viz-flow
{
  colWidth: 160,
  rowHeight: 70,
  nodes: [
    { id: 'base', label: 'base.ts', sub: 'type Query/Mutation', col: 0, row: 0.5, color: 'neutral' },
    { id: 'user', label: 'user.ts', sub: 'чамд бэлэн', col: 1, row: 0, color: 'ok' },
    { id: 'project', label: 'project.ts', sub: 'TODO', col: 1, row: 1, color: 'forge' },
    { id: 'issue', label: 'issue.ts', sub: 'TODO', col: 2, row: 0, color: 'forge' },
    { id: 'comment', label: 'comment.ts', sub: 'TODO', col: 2, row: 1, color: 'forge' },
    { id: 'index', label: 'index.ts', sub: 'typeDefs = [ … ]', col: 3, row: 0.5, color: 'gql' },
  ],
  edges: [
    { from: 'base', to: 'user' }, { from: 'base', to: 'project' },
    { from: 'user', to: 'issue' }, { from: 'project', to: 'comment' },
    { from: 'issue', to: 'index' }, { from: 'comment', to: 'index' },
  ],
}
```

**`schema/user.ts` бэлэн болсон**, эхлээд бүтэн жишээ болгон унш. User бүр email-тэй мөртлөө `email` *nullable* байгааг анзаар: spec-ээр зөвхөн тухайн user болон admin-ууд л үүнийг харж болдог тул бусдад нь `null` болж гарна (үүнийг Module 8-д хийнэ).

## Spec

"Үргэлж байдаг" → non-null. "Дутуу байж болно / байхгүй байж болно" → nullable. "List" → үргэлж list, өөрөөр заагаагүй бол доторх нь хэзээ ч null биш.

### Enum-ууд (`issue.ts` дотор)

- `IssueStatus`: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`
- `Priority`: `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- `IssueSort`: `NEWEST`, `OLDEST`, `UPDATED`

### `project.ts`

**Project**: `id` (ID), `key` (текст), `name` (текст), `description` (текст, байхгүй бол хоосон string), `owner` (User), `members` (User-уудын list), бүгд үргэлж байдаг. Үүнээс гадна:

- `issues`: Issue-уудын list. Argument-ууд: `filter` (`IssueFilter`, заавал биш), `sort` (`IssueSort`, default нь `NEWEST`), `limit` (int, default нь `20`), `offset` (int, default нь `0`).
- `issueCount`: int, үргэлж байдаг. Argument: `filter` (заавал биш `IssueFilter`).
- `stats`: `ProjectStats`, үргэлж байдаг.

**ProjectStats**: `total` (int), `byStatus` (`StatusCount`-уудын list), `workload` (`Workload`-уудын list). Бүгд үргэлж байдаг.
**StatusCount**: `status` (IssueStatus), `count` (int). **Workload**: `user` (User), `open` (int). Бүгд үргэлж байдаг.

**CreateProjectInput**: `key`, `name` нь заавал байх текст, `description` нь заавал биш текст.

Root field-үүд: `projects` (Project-уудын list), `project(key)` (**байхгүй байж болох** Project; `key` нь заавал байх текст). Mutation-ууд: `createProject(input)` → Project (үргэлж буцна), `addMember(projectId, userId)` → Project (хоёр argument хоёулаа заавал байх ID).

### `issue.ts`

**Label**: `name`, `color` (текст, үргэлж байдаг).

**Issue**, үргэлж байдаг: `id`, `number` (int), `key` (`TF-12` шиг текст), `title`, `description`, `status`, `priority`, `labels` (Label-уудын list), `project` (Project), `reporter` (User), `comments` (Comment-уудын list), `commentCount` (int), `createdAt` ба `updatedAt` (ISO-8601 текст). **Байхгүй байж болно:** `assignee` (User).

**IssueFilter** (input, field бүр заавал биш): `status`, `priority`, `assigneeId` (ID; ил өгсөн `null` нь "assign хийгдээгүй" гэсэн үг), `label` (текст), `search` (текст).

**LabelInput**: `name` заавал, `color` заавал биш.
**CreateIssueInput**: `projectId` (заавал байх ID), `title` (заавал), `description`, `priority`, `assigneeId`, `labels` (LabelInput-уудын list; list өөрөө заавал биш, item-ууд non-null).
**UpdateIssueInput**: field бүр заавал биш: `title`, `description`, `status`, `priority`, `assigneeId`.

Root field: `issue(id)` (байхгүй байж болно). Mutation-ууд бүгд үргэлж байдаг утга буцаана: `createIssue(input)` → Issue, `updateIssue(id, input)` → Issue, `deleteIssue(id)` → ID, `addLabel(issueId, label: LabelInput)` → Issue, `removeLabel(issueId, name)` → Issue. Бүх argument заавал байх.

### `comment.ts`

**Comment**: `id`, `body`, `author` (User), `createdAt` (ISO текст), бүгд үргэлж байдаг. Mutation `addComment(issueId, body)` → Comment, argument-ууд заавал байх.

Root field бүрийг өөрийн domain-ий файлд `extend type Query` / `extend type Mutation`-ээр зарла. Тестүүд чиний schema-г introspection-аар уншина, frontend tool-ын харах зүйл яг энэ.

## Hints

### Spec-ийг type болгон унших
"Issue-уудын list, үргэлж байдаг, null байхгүй" → `[Issue!]!`. "Байхгүй байж болох Project" → `Project`. "Заавал байх текст argument" → `key: String!`. Default нь type-ын дараа ордог: `sort: IssueSort = NEWEST`.

### Non-null item-тэй, заавал биш list
"list өөрөө заавал биш, item-ууд non-null" → `labels: [LabelInput!]` (гаднах `!` байхгүй).

### Файл хоорондын reference
`project.ts` дотроос `issue.ts`-д зарласан `Issue`, `IssueFilter`-ийг дурдаж болно: schema бүтээгдэхээс өмнө бүх файл нэг schema болж нэгдэнэ. `typeDefs` array-ийн дараалал хамаагүй, `base` өргөтгөгдөж буй root-уудаа зарласан байхад л болно.
