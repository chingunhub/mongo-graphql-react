---
title: "Taskforge: resolver-үүд"
summary: "Schema-г өөрийн data layer-тэй холбо: query, field resolver, mutation, server factory."
source: 07c50df0519debd4e4fe5ed5b8f15480caf4c53b627da397bfe34d668ace1a1f
---

Чиний schema бол амлалт, энэ шат түүнийг биелүүлнэ. Part I-д бүтээсэн бүх зүйл холбогдоно: repository-ийн filter-үүд `Project.issues(filter…)` болж, `createInProject` нь `createIssue` болж, stats service нь `Project.stats` болно.

```viz-flow
{
  colWidth: 175,
  rowHeight: 66,
  nodes: [
    { id: 'schema', label: 'schema/*.ts', sub: 'Module 6', col: 0, row: 0, color: 'gql' },
    { id: 'res', label: 'resolvers/*.ts', sub: 'чи, одоо', col: 1, row: 0, color: 'forge' },
    { id: 'srv', label: 'server.ts', sub: 'createApolloServer()', col: 2, row: 0, color: 'forge' },
    { id: 'repo', label: 'repositories/', sub: 'Module 3, 4', col: 1, row: 1, color: 'mongo' },
    { id: 'svc', label: 'services/stats', sub: 'Module 5', col: 0, row: 1, color: 'mongo' },
    { id: 'models', label: 'models/', sub: 'Module 1–5', col: 2, row: 1, color: 'mongo' },
  ],
  edges: [
    { from: 'schema', to: 'srv', dashed: true }, { from: 'res', to: 'srv' },
    { from: 'res', to: 'repo' }, { from: 'res', to: 'svc' }, { from: 'res', to: 'models' },
  ],
}
```

**Эхлээд унш**: `resolvers/user.ts` (дууссан бүтэн жишээ), `resolvers/util.ts` (өгөгдсөн helper-ууд: `idOf`, `toISO`, `notFound`), `resolvers/project.ts` (хоёр query нь бэлэн). Authentication Module 8-д ирнэ. Одоохондоо context зүгээр л `currentUser`-ийг агуулна (тестүүд ч, playground ч түүнийг дамжуулдаг).

## Даалгавар

### `server.ts`
`createApolloServer()` нь чиний `typeDefs`, `resolvers`-тэй **шинэ** `ApolloServer` буцаана.

### `resolvers/project.ts`
- `Project.id`, `owner`, `members` (нэрээр sort хийсэн).
- `Project.issues(filter, sort, limit, offset)` ба `issueCount(filter)` чиний repository-оор дамжина. SDL-ийн default-уудыг GraphQL өөрөө бөглөдөг; `filter` байхгүй эсвэл `null` байж болно.
- `Project.stats` → `projectStats`-аас `{ total, byStatus }` **болон** stats service-ээс `workload`. `Workload.user` мөрийн `userId`-аас user-ийг ачаалдаг.
- `createProject(input)` — одоогийн user нь `owner` **ба** анхны member болно.
- `addMember(projectId, userId)` — давхардуулалгүй нэмээд project-ыг буцаана. Олдохгүй эсвэл буруу хэлбэртэй `projectId` → `NOT_FOUND`.

### `resolvers/issue.ts`
- `Query.issue(id)` — олдохгүй эсвэл буруу хэлбэртэй id-д `null`.
- `Issue.id`, `project`, `reporter`, `assignee` (assign хийгдээгүй бол null), `comments` (хуучин нь эхэнд), `commentCount`, `createdAt`/`updatedAt` (ISO string), мөн **`key`**: project-ийн key ба issue-ийн дугаар, жишээ нь `TF-12`.
- `createIssue(input)` — `Issue.createInProject`-г ашиглана, reporter нь одоогийн user. `assigneeId` → `assignee`. Олдохгүй project → `NOT_FOUND`.
- `updateIssue(id, input)` — чиний repository-ийн `updateIssue`-ээр. `assigneeId` орхигдвол хөдөлгөхгүй, `assigneeId: null` бол assign-ийг салгана. Олдохгүй бол `NOT_FOUND`.
- `deleteIssue(id)` — issue болон **түүний comment-уудыг** устгаад id-г буцаана. Олдохгүй бол `NOT_FOUND`.
- `addLabel` / `removeLabel` — repository-оор. Олдохгүй issue → `NOT_FOUND`.

### `resolvers/comment.ts`
- `Comment.id`, `author`, `createdAt`.
- `addComment(issueId, body)` — comment-ийг бичсэн нь одоогийн user. Олдохгүй issue → `NOT_FOUND`.

Алдаануудад `util.ts`-ийн `notFound('Issue')` / `notFound('Project')`-ийг хэрэглэ.

> [!WARNING]
> Resolver бүр GraphQL-д Mongoose Query биш **Promise** өг: chain-ээ `.exec()`-ээр төгсгө, эсвэл `await` хий. Чиний repository function-ууд `async` учраас аль хэдийн аюулгүй.

## Hints

### Parent-ийг унших
`Issue.*` resolver-ийн parent нь issue-г гаргаж өгсөн юм бүр байж болно: `findById`-ийн бүтэн document, чиний repository-ийн document, эсвэл хожим өөр зүйл. `issue.project` бол ObjectId (эсвэл populate хийгдсэн doc, `idOf` хоёуланг нь зохицуулна).

### Issue.key
Project-ийн `key` хэрэгтэй: `Project.findById(idOf(issue.project)).select('key').exec()`, дараа нь `` `${project.key}-${issue.number}` ``. Тийм ээ, энэ нь issue бүрт нэг query. Үүнийг Module 9-ийн query log дээр харж, тэнд засна.

### Input-ыг model-ийн хэлбэр рүү хөрвүүлэх
`const { projectId, assigneeId, ...rest } = input;` гээд model-д хэрэгтэй зүйлээ бүтээ. Update-д: `if (assigneeId !== undefined) patch.assignee = assigneeId;`, хэзээ ч `||` биш.
