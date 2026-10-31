---
title: "Taskforge: N+1-уудыг устга"
summary: User, project, comment болон comment-ийн тоонд зориулсан request бүрийн DataLoader-ууд, context-оор дамжуулан field resolver бүрт холбогдоно.
source: 29535c6db92b53a23e4e0e28dd0ab3d8b3ce054f3278ab769a97fd9ab920c252
---

Эхлээд playground-ийг ажиллуул. Энэ нь 20 issue-той board-ыг хүмүүс, comment, тоотой нь ачаалж, database query-ийн тоог хэвлэнэ. Refactor хийсний дараа дахин ажиллуул. Өмнөх болон дараах тэр тоо л энэ алхмын гол санаа.

## Даалгавар

### 1. `server/graphql/loaders.ts` — `createLoaders()`

| Loader | Key (string id) | Утга |
| --- | --- | --- |
| `userById` | user id | User document, эсвэл `null` |
| `projectById` | project id | Project document, эсвэл `null` |
| `commentCountByIssue` | issue id | comment-ийн тоо (байхгүй бол `0`) — **нэг aggregation** |
| `commentsByIssue` | issue id | тэр issue-ийн comment-ууд, **хамгийн эртнээс нь эхэлж** (байхгүй бол `[]`) |

Batch бүрт нэг database дуудалт, үр дүн key-ийн дарааллаар.

### 2. Холбох
- `resolvers/types.ts`: `Context` interface-д `loaders` нэм (`ReturnType<typeof createLoaders>` болно).
- `context.ts`: `buildContext` нь `{ currentUser, loaders: createLoaders() }` буцаана — request бүрт шинээр.

### 3. Field resolver-үүдэд ашиглах
- `Issue.key`, `Issue.project` → `projectById`
- `Issue.reporter`, `Issue.assignee` → `userById`
- `Issue.commentCount` → `commentCountByIssue`; `Issue.comments` → `commentsByIssue`
- `Project.owner`, `Project.members` (`loadMany`, name-ээр sort хийгдсэн хэвээр), `Workload.user`, `Comment.author` → `userById`

Response бүрийг яг адилхан хэвээр үлдээ. Зорилго: board-ын query-ийн тоо issue-ийн тоогоор **өсөхгүй**.

> [!TIP]
> Loader key-үүд **string** байх ёстой: `ctx.loaders.userById.load(String(idOf(issue.reporter)))`. ObjectId бол object тул ижил id-тай хоёр ObjectId `===` биш. Тэгэхээр loader-ийн cache алдаж, key давтагдана.

## Hints

### By-id loader-ийн хэлбэр
```ts
new DataLoader<string, any>(async (ids) => {
  const docs = await User.find({ _id: { $in: ids } });
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return ids.map((id) => byId.get(id) ?? null);
});
```

### Тоолох ба бүлэглэх
Тоолох: `Comment.aggregate`-д `$match: { issue: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } }` ба `$group`. Бүлэглэх: `Comment.find({ issue: { $in: ids } }).sort({ createdAt: 1, _id: 1 })`, дараа нь `String(c.issue)`-ээр хувааж бүлэглэ.

### members, sort хийгдсэн
`loadMany` үр дүнг key-ийн дарааллаар өгдөг тул дараа нь sort хий: `(await ctx.loaders.userById.loadMany(ids)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))`.
