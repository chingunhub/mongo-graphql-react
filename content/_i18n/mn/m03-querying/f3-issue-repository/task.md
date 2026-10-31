---
title: "Taskforge: issue repository"
summary: "API-д issue-той холбоотой хэрэгтэй бүх query нэг дор: filter, sort, pagination, аюулгүй update, label."
source: c3cb1f3370a4e8956b6bc642fbac6360acc2514adfc3d54ebaa792c920e8d645
---

Тавин resolver дунд `Issue.find({...})` цацагдсан, тус бүр нь filter-ийг арай өөрөөр бүтээж байхыг том codebase-д хэн ч хүсэхгүй. Хэрэгтэй нь **issue-ийн query-г ганцаараа эзэмшдэг модуль**: repository. Part II-д GraphQL layer ирэхэд resolver-үүд эдгээр function-ийг дуудаж л байх нимгэн wrapper болно.

```viz-flow
{
  colWidth: 200,
  rowHeight: 70,
  nodes: [
    { id: 'r1', label: 'Project.issues', sub: 'resolver (Part II)', col: 0, row: 0, color: 'gql' },
    { id: 'r2', label: 'Mutation.updateIssue', sub: 'resolver (Part II)', col: 0, row: 1, color: 'gql' },
    { id: 'repo', label: 'repositories/issues.ts', sub: 'чи, яг одоо', col: 1, row: 0.5, color: 'forge', w: 175 },
    { id: 'm', label: 'Issue model', col: 2, row: 0.5, color: 'mongo' },
  ],
  edges: [
    { from: 'r1', to: 'repo' },
    { from: 'r2', to: 'repo' },
    { from: 'repo', to: 'm' },
  ],
}
```

## Даалгавар

`server/repositories/issues.ts` дотор эдгээр function-уудыг үүсгэ.

### `buildIssueFilter(projectId, filter = {})`

MongoDB filter object-ийг буцаана (query хийхгүй). Үргэлж project-оор хязгаарлагдсан байна. `filter`-ийн заавал биш key-ууд:

| Key | Утга |
| --- | --- |
| `status`, `priority` | яг тэнцүү |
| `assigneeId` | user id string → тэр user-т assign хийсэн issue-ууд. **`null` → assign хийгээгүй issue-ууд.** Өгөөгүй (`undefined`) → assignee-ийн filter огт байхгүй. |
| `label` | энэ нэртэй label-тай issue-ууд (том жижгийг ялгахгүй: label-ын нэр lowercase-ээр хадгалагддаг) |
| `search` | том жижгийг ялгахгүй, яг үсгээр нь "title-д агуулсан" хайлт |

### `listIssues(projectId, filter = {}, options = {})`

- `options.sort`: `'NEWEST'` (default, `createdAt`-аар буурахаар), `'OLDEST'` (`createdAt`-аар өсөхөөр) эсвэл `'UPDATED'` (`updatedAt`-аар буурахаар). Үргэлж тогтвортой tiebreaker-тай.
- `options.limit` (default 20, 100-аас хэтрэхгүй) ба `options.offset` (default 0).
- Issue **document**-уудаар resolve болно (API layer-т `id` шиг virtual хэрэгтэй).

### `countIssues(projectId, filter = {})`

Ижил filter-үүдэд таарсан issue-ийн тоо.

### `updateIssue(id, patch)`

Хэсэгчилсэн update хийж, **шинэчлэгдсэн** issue-ээр resolve болно, байхгүй бол `null`.

- Зөвхөн эдгээр key-г өөрчилж болно: `title`, `description`, `status`, `priority`, `assignee`. `patch` доторх бусад бүхнийг (жишээ нь `project`, `number`, `reporter`) **тоохгүй**. Энэ function user-ийн оролтоор дуудагдана.
- `undefined` key-г алгасна. `assignee: null` бол assign-ыг **цуцална**.
- Schema-ийн дүрэм хэвээр үйлчилнэ (буруу status эсвэл 2 тэмдэгттэй title reject хийгдэнэ).

### `addLabel(issueId, { name, color? })` ба `removeLabel(issueId, name)`

- `addLabel` label-ыг нэмнэ, гэхдээ issue-д **тэр нэртэй label аль хэдийн байвал** (том жижгийг ялгахгүй) issue-г өөрчлөлтгүй буцаана. Зэрэг дуудагдсан ч аюулгүй байх ёстой: `addLabel(id, { name: 'bug' })`-г нэгэн зэрэг хоёр дуудахад яг нэг `bug` label үлдэнэ.
- `removeLabel` тэр нэртэй label-ыг хасна (том жижгийг ялгахгүй).
- Хоёулаа шинэчлэгдсэн issue-ээр resolve болно, issue байхгүй бол `null`.

## Hints

### null ба undefined
Filter хийх *эсэхээ* `filter.assigneeId !== undefined`-ээр шийд, дараа нь утгыг шууд хэрэглэ: string id ч, `null` ч `{ assignee: value }` хэлбэрээр утга учиртай.

### Update-д зориулсан whitelist
Зөвшөөрөгдсөн key-үүдээр давтаж, `patch` дотроос `!== undefined` байгааг л `$set` object руу хуул. Дараа нь `findByIdAndUpdate(id, { $set }, { returnDocument: 'after', runValidators: true })`.

### Давхардсан label-гүй, atomic байдлаар
`$addToSet` бүтэн object-уудыг харьцуулдаг тул `{ name: 'bug', color: '#f00' }`, `{ name: 'bug', color: '#00f' }` хоёул орчихно. Оронд нь нөхцөлт `$push` хэрэглэ: `{ _id, 'labels.name': { $ne: name } }`-аар filter хий. Хэрэв энэ `null` буцаавал issue байхгүй эсвэл label нь аль хэдийн байгаа гэсэн үг, тиймээс зөв зүйлийг буцаахын тулд `findById`-аар хайж үз. Нэрийг filter дотроо өөрөө lowercase болго. Setter дээд түвшний path дээрх filter-ийн утгыг cast хийдэг ч, nested array path доторх `$ne` дээр түүнд найдаж болохгүй.
