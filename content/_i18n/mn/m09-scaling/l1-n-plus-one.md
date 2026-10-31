---
title: N+1 асуудал ба DataLoader
source: 2e21785e80b9636b3d0f586fe1456de54ce1866866e4c8141ca2955b9ca53412
---

Чиний Taskforge API зөв ажиллаж байна. Одоо хэр их ажил хийж байгааг нь харъя. Энэ бол яг л ердийн board query:

```graphql
{
  project(key: "TF") {
    issues(limit: 20) {
      key
      title
      assignee { name }
      reporter { name }
      commentCount
    }
  }
}
```

Module 7-д бичсэн resolver-үүдээрээ энэ query хэдэн database query үүсгэхийг тоолоод үз:

```viz-flow
{
  title: 'Нэг board request-ийн query-үүд (20 issue)',
  colWidth: 150,
  rowHeight: 66,
  nodes: [
    { id: 'p', label: 'project', sub: '1', col: 0, row: 1, color: 'mongo' },
    { id: 'i', label: 'issues', sub: '1', col: 1, row: 1, color: 'mongo' },
    { id: 'k', label: 'Issue.key', sub: '20 × Project.findById', col: 2, row: 0, color: 'bad', w: 140 },
    { id: 'a', label: 'Issue.assignee', sub: '≤ 20 × User.findById', col: 2, row: 1, color: 'bad', w: 140 },
    { id: 'r', label: 'Issue.reporter', sub: '20 × User.findById', col: 2, row: 2, color: 'bad', w: 140 },
    { id: 'c', label: 'commentCount', sub: '20 × countDocuments', col: 3, row: 1, color: 'bad', w: 140 },
  ],
  edges: [
    { from: 'p', to: 'i' }, { from: 'i', to: 'k' }, { from: 'i', to: 'a' }, { from: 'i', to: 'r' }, { from: 'i', to: 'c' },
  ],
  steps: [
    { focus: ['p', 'i', 'p>i'], caption: 'Project болон түүний 20 issue-г авахад хоёр query. Одоохондоо бүх юм хэвийн.' },
    { focus: ['k', 'a', 'r', 'c', 'i>k', 'i>a', 'i>r', 'i>c'], caption: 'Дараа нь **field resolver бүр issue болгонд тусдаа ажиллана**: бараг 80 query нэмэгдэнэ. Ихэнх нь *ижил* зүйлийг асууж байна: ижил project-ыг 20 удаа, ижил 3 хүнийг дахин дахин. Энэ бол **N+1** (энд бүр 4N+2 гэж хэлж болно).' },
  ],
}
```

Query бүр хурдан, localhost дээр 1 ms орчим. Production дээр round trip бүр 2–5 ms-ийн network latency нэмнэ. Нэг хуудсанд 100 issue харуулдаг бол энэ request секундээс илүү үргэлжилж, database-ийг базна. Гэтэл код чинь хаана ч буруу *харагдахгүй*: resolver бүр жижигхэн, тус тусдаа зөв. N+1 нь GraphQL-ийн сонгодог performance bug болдог нь үүнээс.

## GraphQL яагаад үүнд өртөмтгий вэ

Resolver-үүдийг **нэг field-ээр** бичдэг, хөрш field-үүдийнхээ тухай юу ч мэддэггүй. `Issue.assignee` нь яг тэр tick дотор өөр 19 `Issue.assignee` дуудагдаж байгааг харж чадахгүй. Root resolver дээр бүгдийг populate хийж *болно*. Гэхдээ тэгвэл assignee-г огт асуугаагүй query-д ч ачаална, мөн query бүрийн хэлбэрийг урьдчилан таах хэрэгтэй болно.

Чамд хэрэгтэй зүйл бол тэр 20 хараат бус дуудлагыг араар нь **нэг** query болгон нийлүүлэх арга. DataLoader яг үүнийг хийдэг.

## DataLoader: эхлээд batch, дараа нь cache

```ts
import DataLoader from 'dataloader';

const userById = new DataLoader(async (ids: readonly string[]) => {
  const users = await User.find({ _id: { $in: ids } });
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return ids.map((id) => byId.get(id) ?? null); // same length, same order as `ids`!
});

// in resolvers:
assignee: (issue, _args, ctx) => (issue.assignee ? ctx.loaders.userById.load(String(issue.assignee)) : null),
```

20 `Issue.assignee` resolver тус бүр `load()` дуудахад юу болдгийг харъя:

```viz-sequence
{
  actors: [
    { id: 'r', label: '20 × Issue.assignee', color: 'gql' },
    { id: 'dl', label: 'userById loader', color: 'forge' },
    { id: 'db', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'r', to: 'dl', label: "load('u1')", note: 'Эхний resolver u1 user-ийг асууна. Loader query хийхгүй, key-г **queue**-д хийгээд promise буцаана.' },
    { from: 'r', to: 'dl', label: "load('u2'), load('u1'), load('u3')…", note: 'Бусад resolver-үүд event loop-ийн яг тэр tick дотор ажиллана. `load` бүр өөрийн key-г queue-д нэмнэ. Давхардсан key (`u1` дахин) **ижил** promise авна.' },
    { from: 'dl', to: 'dl', label: 'end of tick → batch', note: 'Одоогийн tick дуусахад DataLoader чиний **batch function-ыг** давхардаагүй бүх key-тэй нь нэг удаа дуудна: `["u1", "u2", "u3"]`.' },
    { from: 'dl', to: 'db', label: 'User.find({ _id: { $in: [u1, u2, u3] } })', note: 'Хорин query-ийн оронд нэг.' },
    { from: 'db', to: 'dl', label: '3 users (any order)', ret: true },
    { from: 'dl', to: 'r', label: 'resolve each promise', ret: true, note: 'Хүлээж байсан resolver бүр өөрийн user-ийг авна. Энэ request дотор дараа нь `load(\'u1\')` дуудвал loader-ийн **cache**-ээс тэр дор нь буцна.' },
  ],
}
```

Энэ дараалал бол сайн тохиолдол. Ялгааг мэдрэхийн тулд яг тэр хуудсыг counter хэлбэрээр доор тавьлаа. Алхам алхмаар гүйлгэхээсээ өмнө таамгаа хийгээрэй, дараа нь нөгөө resolver-ийг, мөн илүү том хуудсыг турш.

```viz loader-lab
{}
```

### Batch function-ы contract

DataLoader үр дүнг key-тэй **байрлалаар нь** тааруулдаг. Тиймээс batch function-ы буцаах array чинь хүлээн авсан key-үүдтэйгээ **урт, дараалал** хоёроороо тэнцүү байх ёстой. MongoDB бол document-уудаа ямар дарааллаар ч буцааж болно, байхгүй id-г ч чимээгүй орхино:

```viz-pipeline
{
  title: 'Үр дүнг key-тэй тааруулах',
  color: 'forge',
  input: { label: 'keys', docs: ['$$"u3"', '$$"u9"', '$$"u1"'], note: 'DataLoader u3, u9, u1-ийг яг энэ дарааллаар асууна. u9 өнгөрсөн долоо хоногт устгагдсан.' },
  stages: [
    { label: 'User.find($in)', docs: [{ _id: 'u1', name: 'Ada' }, { _id: 'u3', name: 'Linus' }], note: 'MongoDB өөрийн дарааллаар 2 document буцаана. Энэ array-г яг байгаагаар нь буцаавал u3 Ada-г, u9 Linus-ийг авч, u1 юу ч авахгүй. **Чимээгүй өгөгдөл эвдрэл.**' },
    { label: 'id-аар Map болгох', code: 'new Map(users.map(u => [String(u._id), u]))', docs: ['$$"u1" → Ada', '$$"u3" → Linus'] },
    { label: 'keys.map(…)', code: 'ids.map(id => byId.get(id) ?? null)', docs: [{ name: 'Linus' }, '$$null', { name: 'Ada' }], note: 'Key-үүдийн дараалалд буцаж, байхгүй нэгэнд нь `null`. Batch function-ы буцаах зүйл **энэ**.' },
  ],
}
```

`ids.map(id => byId.get(id) ?? null)` гэсэн мөр бол ямар ч batch function-ы хамгийн чухал мөр. Мартвал нэг item-тэй бүх тестийг давчихдаг bug гарна.

**Key-ийн төрлийг** ч анзаар. ObjectId-ууд бие биетэйгээ `===` тэнцдэггүй, харин loader-ийн cache `===`-ээр (Map-аар дамжуулан) харьцуулдаг. Key-г string болгон normalize хий, `load(String(issue.assignee))` шиг. Үгүй бол cache алдаж, key-үүд давхардана.

### Request бүрт нэг loader

```ts
// ✘ module level: shared by every request, forever
export const userById = new DataLoader(batchUsers);

// ✔ created in the context function, per request
context: async ({ req }) => ({ currentUser: …, loaders: createLoaders() }),
```

DataLoader-ийн cache-ийн хугацаа хэзээ ч дуусдаггүй. Module түвшний loader хуучирсан өгөгдлийг мөнхөд өгнө (user-ийн нэрийг өөрчилсөн ч хуучин нэр нь үлдэнэ). Бүр дордох нь, нэг user-ийн эрхээр ачаалсан өгөгдлийг өөр user-д өгч магадгүй. **Loader-ууд context-д харьяалагдана.** Тэгвэл cache яг нэг request-ийн турш амьдарна, чиний хүссэн зүйл энэ.

## "By id" биш loader-ууд

Batch хийж болох бүх зүйлд энэ загвар таарна. 20 issue-ийн comment-ийг нэг aggregation-аар тоолъё:

```ts
const commentCountByIssue = new DataLoader(async (issueIds: readonly string[]) => {
  const rows = await Comment.aggregate([
    { $match: { issue: { $in: issueIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: '$issue', count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map((r) => [String(r._id), r.count]));
  return issueIds.map((id) => counts.get(id) ?? 0); // issues with no comments: 0, not null
});
```

(ObjectId-г гараар cast хийснийг анзаар. Энэ бол aggregation, Module 5-ын урхи.)

## DataLoader ба populate

| | `populate()` | DataLoader |
| --- | --- | --- |
| Batch хийдэг үү? | тийм, query бүрийн дотор | тийм, tick бүрийн дотор, resolver-үүдийн дундуур |
| Зөвхөн асуусан field-ийн өгөгдлийг ачаалдаг уу? | үгүй, root дээр өөрөө сонгоно | тийм, field resolver зөвхөн сонгогдсон үед ажиллана |
| Бүх request даяар давхардлыг арилгадаг уу? | үгүй | тийм (request бүрийн cache) |
| GraphQL-ийн field-ээр нь явдаг загварт таардаг уу? | эвгүй | байгалийн |

GraphQL server дээр DataLoader бол default хэрэгсэл. Populate GraphQL биш кодын замд (script, REST endpoint, report) одоо ч сайн ажилладаг.

```quiz
Q: Batch function `["a", "b", "c"]` key-үүдийг хүлээн авлаа, MongoDB `c` ба `a`-ийн document-уудыг буцаалаа. Batch function юу буцаах вэ?
- [ ] `[docC, docA]`
- [ ] `[docA, docC]`
- [x] `[docA, null, docC]`
- [ ] `b` байхгүй учир throw хийх
> Key-үүдтэй ижил урт, ижил дараалал. Байхгүй утга нь `null` (эсвэл тэр нэг load-ыг унагах бол `Error` instance).
```

```quiz
Q: Loader-уудыг module түвшинд нэг удаа биш, context function-д яагаад үүсгэдэг вэ?
- [ ] DataLoader-ыг зөвхөн нэг удаа хэрэглэж болно
- [x] Cache-ийн хугацаа хэзээ ч дуусдаггүй: хуваалцсан loader хуучирсан өгөгдөл өгч, нэг user-ийн ачаалсан үр дүнг өөр user-д дамжуулна
- [ ] Module түвшний loader batch хийж чадахгүй
> Request бүрийн loader яг нэг request-д cache хийнэ. Query дотроо давхардлыг арилгахад хангалттай, хуучрахгүй байхад хангалттай богино.
```
