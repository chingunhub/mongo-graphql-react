---
title: "Taskforge: comment ба issue-ийн хуудас"
summary: Reference-тэй Comment model, Issue дээрх virtual populate, issue-ийн хуудсанд хэрэгтэй бүхнийг ачаалдаг нэг function.
source: 8ac46f14e07035d7e80ee3194294065a244d9ceef03074e683f5f4bb1e07289a
---

Taskforge-ийн issue-ийн хуудсанд issue, түүний project, хэн нээсэн, хэнд assign хийгдсэн нь, доор нь яриа харагдана. Comment-ууд хязгааргүй, зөвхөн энэ хуудсанд ачаалагддаг. Тиймээс хичээлд үзсэнээр **өөрийн collection**-той болж, issue руу reference хийнэ.

```viz-flow
{
  colWidth: 185,
  rowHeight: 80,
  nodes: [
    { id: 'c', label: 'Comment', sub: 'issue · author · body', col: 0, row: 0, color: 'forge' },
    { id: 'i', label: 'Issue', sub: 'virtual: comments', col: 1, row: 0, color: 'mongo' },
    { id: 'u', label: 'User', col: 0, row: 1, color: 'mongo' },
    { id: 'p', label: 'Project', col: 2, row: 0, color: 'mongo' },
  ],
  edges: [
    { from: 'c', to: 'i', label: 'issue' },
    { from: 'c', to: 'u', label: 'author' },
    { from: 'i', to: 'p', label: 'project' },
  ],
}
```

## Даалгавар

### 1. `server/models/Comment.ts` → `Comment`-ийг export хий

| Field | Дүрэм |
| --- | --- |
| `issue` | `Issue` руу reference, required |
| `author` | `User` руу reference, required |
| `body` | string, required, trim хийсэн, 2000 тэмдэгтээс хэтрэхгүй |

Timestamp-ийг асаа. `{ issue: 1, createdAt: 1 }` дээр index нэм. Comment query болгон issue-ээр filter хийж, цагаар sort хийдэг, энэ index хоёуланд нь хэрэг болно.

### 2. `server/models/Issue.ts` (чиний файл, үүнийгээ өргөтгө)

- **`comments`** virtual: issue-ийн comment-ууд, **хамгийн хуучин нь эхэнд**.
- **`commentCount`** virtual: issue-д хэдэн comment байгаа.
- Virtual-ууд `toJSON()` болон `toObject()`-д орно.

### 3. `server/repositories/comments.ts`

- **`addComment(issueId, authorId, body)`** — comment үүсгэнэ, `author` нь populate хийгдсэн (зөвхөн `name`) comment-аар resolve болно. Issue байхгүй бол юу ч үүсгэлгүй `null`-аар resolve болно.
- **`listComments(issueId)`** — issue-ийн comment-ууд, хамгийн хуучин нь эхэнд, тус бүрийн `author` нь populate хийгдсэн (зөвхөн `name`).

### 4. `server/repositories/issues.ts` — `getIssueDetail(id)` нэм

Шинэ function export хий. Энэ нь issue-ээр resolve болно, дараах нь populate хийгдсэн байна:

- `project`: `name`, `key`
- `reporter`, `assignee`: `name`, `email`
- `comments`, мөн comment бүрийн `author`-ыг `name`-тэй нь
- `commentCount`

Олдохгүй id-д **болон** `"not-an-id"` шиг буруу хэлбэртэй id-д `null`-аар resolve болно. Энэ function удахгүй id-г API request-ээс шууд авах тул `CastError` throw хийх ёсгүй.

Мөн comment олширох тусам удаашрах ёсгүй: issue-д 2 comment байсан ч 200 байсан ч query-ийн тоо ижил хэвээр байх ёстой.

## Hints

### Issue дээрх comment virtual-ууд
Хичээлийнхтэй ижил хэлбэр: `ref: 'Comment', localField: '_id', foreignField: 'issue'`. Дарааллыг `options: { sort: { createdAt: 1 } }`-оор тогтооно, тоолохыг `count: true`-тай хоёр дахь virtual хийнэ. Schema option-уудыг schema үүссэний дараа `issueSchema.set('toJSON', { virtuals: true })`-ээр нэмж болно.

### Nested populate
`populate({ path: 'comments', populate: { path: 'author', select: 'name' } })`. Mongoose бүх comment-ийн author-уудыг цуглуулж **нэг** query-ээр татна. Author ачаалахаар comment-уудаар loop бүү хий.

### Буруу хэлбэртэй id
`mongoose.isValidObjectId(id)` нь утгыг ObjectId болгож cast хийж болох эсэхийг хэлнэ. Эхлээд үүнийг шалгаад, эрт `null` буцаа.
