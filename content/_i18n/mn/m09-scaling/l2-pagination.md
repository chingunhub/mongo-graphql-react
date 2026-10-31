---
title: "Pagination: offset, cursor ба connection"
source: 0b402d808965c0bd5c4bf5ee2220386f34c32409f8c5daf1104cb9c3194ef78d
---

`issues(limit: 20, offset: 40)` ажилладаг, олон дэлгэцэнд хангалттай ч байдаг. Гэхдээ app томрох тусам хоёр асуудал гарна. GraphQL ecosystem хоёуланд нь стандарт хариулттай: **connection**. Ихэнх том GraphQL schema-д яг энэ таардаг тул сайн ойлгох нь зүйтэй.

## Offset-д юу буруу болдог вэ

**Асуудал 1: pagination хийж байхад жагсаалт хөдөлдөг.** Завгүй board дээр infinite scroll хийе, хамгийн шинэ нь эхэнд:

```viz-pipeline
{
  title: 'Хэн нэгэн issue нэмж байх үед offset-ээр pagination хийх',
  color: 'gql',
  input: { label: 'issue-ууд, хамгийн шинэ нь эхэнд', docs: ['$$TF-9', '$$TF-8', '$$TF-7', '$$TF-6', '$$TF-5', '$$TF-4'] },
  stages: [
    { label: 'хуудас 1', code: 'limit 3, offset 0', docs: ['$$TF-9', '$$TF-8', '$$TF-7'], note: 'Эхний гурвыг харна.' },
    { label: 'хэн нэгэн TF-10-г үүсгэнэ', docs: ['$$TF-10', '$$TF-9', '$$TF-8', '$$TF-7', '$$TF-6', '$$TF-5', '$$TF-4'], note: 'Шинэ issue хамгийн дээр орно. Бүх item нэг байрлал доош шилжинэ.' },
    { label: 'хуудас 2', code: 'limit 3, offset 3', docs: ['$$TF-7  ← again!', '$$TF-6', '$$TF-5'], note: '"3-ыг алгас" гэдэг одоо TF-10, TF-9, TF-8-ыг алгасна, тэгэхээр **TF-7 хоёр удаа гарна**. Харин item устгавал нэг нь чимээгүй алга болно.' },
  ],
}
```

**Асуудал 2: том offset удаан.** `skip(10000)` үсэрдэггүй. Database 10,000 index entry-г дайран алхаад 10,001-рийг олдог. 3-р хуудсан дээр зүгээр, 500-р хуудсан дээр хүнд.

## Cursor: "N-ийг алгас" биш, "энийг дараа"

Cursor нь дугаарыг биш, **sort key**-ийг ашиглан *хаана байсныг* тэмдэглэнэ. "Миний хамгийн сүүлд харсан issue-с өмнө үүссэн 20-ийг өг" гэсэн үг:

```ts
// sorted by createdAt desc, _id desc (tiebreaker!)
// after the issue with createdAt = C and _id = I:
{
  $or: [
    { createdAt: { $lt: C } },               // strictly older
    { createdAt: C, _id: { $lt: I } },       // same timestamp, smaller id
  ],
}
```

Дээр шинэ item нэмэгдэх нь "C-ээс хуучин" гэсэн нөхцөлийг огт хөдөлгөхгүй, тиймээс 2-р хуудас тогтвортой. Мөн sort key-үүд дээр index байвал database cursor-ын байрлал руу шууд үсэрнэ: 500-р хуудас 1-р хуудастай адил өртөгтэй.

> [!IMPORTANT] Cursor-т tiebreaker заавал орно
> Cursor зөвхөн `createdAt`-ийг кодолбол тэр timestamp-ыг хуваалцсан бүх item алгасагдана, эсвэл давтагдана (bulk import олон зуун ижил timestamp үүсгэдэг). **Бүх** sort key-г, тэр дундаа давхцахгүй tiebreaker-ийг кодол. Module 3-ын тогтвортой sort-той яг ижил дүрэм, яг ижил шалтгаантай.

### Opaque cursor

Client cursor-ыг өөрөө бүтээж, задлах ёсгүй: тэгвэл чиний sort-ын хэрэгжүүлэлт client бүр дээр хөлдөнө. Тиймээс opaque string болгон кодол:

```ts
const encodeCursor = (doc) =>
  Buffer.from(JSON.stringify([doc.createdAt.getTime(), String(doc._id)])).toString('base64url');

function decodeCursor(cursor: string) {
  try {
    const [t, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof t !== 'number' || !mongoose.isValidObjectId(id)) throw new Error();
    return { createdAt: new Date(t), id: new mongoose.Types.ObjectId(id) };
  } catch {
    throw badInput('Invalid cursor'); // a client error, not a server crash
  }
}
```

Opaque гэдэг нь нууц гэсэн үг биш, base64-ийг хэн ч decode хийж чадна. Харин *"дотор нь юу байгаагаас хамаарахгүй"* гэсэн үг. Ирэх жил формат солиход хуучин client анзаарахгүй. Хуучин cursor-ууд зүгээр л эвтэйхэн error өгнө (invalid cursor-ууд `BAD_USER_INPUT` байдгийн учир энэ).

## Connection хэлбэр

Энэ convention Relay-ээс гаралтай, бараг хаа сайгүй хэрэглэгддэг. Нэг хуудас үр дүнг ингэж ороодог:

```viz-tree
{
  title: 'project { issueConnection(first: 2, after: "…") { … } }',
  root: {
    label: 'IssueConnection', color: 'gql', id: 'conn',
    children: [
      { label: 'edges: [IssueEdge!]!', id: 'edges', children: [
        { label: '[0] cursor: "WzE3…"', id: 'c0', color: 'neutral' },
        { label: '[0] node: Issue { key: "TF-24" … }', id: 'n0', color: 'neutral' },
        { label: '[1] cursor: "WzE2…"', id: 'c1', color: 'neutral' },
        { label: '[1] node: Issue { key: "TF-23" … }', id: 'n1', color: 'neutral' },
      ]},
      { label: 'pageInfo: PageInfo!', id: 'pi', children: [
        { label: 'hasNextPage: true', id: 'hnp', color: 'neutral' },
        { label: 'endCursor: "WzE2…"', id: 'ec', color: 'neutral' },
      ]},
      { label: 'totalCount: 24', id: 'tc', color: 'neutral' },
    ],
  },
  steps: [
    { focus: ['edges'], caption: '**edges**: item бүрт нэг. Edge нь item-ийг (`node`) болон тэр item-ийн `cursor`-ыг барина. Item-уудыг edge-д ороосноор дараа нь холбоо тус бүрийн өгөгдөл (жишээ нь "project-д нэмэгдсэн цаг") нэмэх зай үлдэнэ.' },
    { focus: ['c0', 'n0', 'c1', 'n1'], caption: 'Node бүр бүтэн `Issue`: ердийнхөөрөө хүссэн field-үүдээ сонго.' },
    { focus: ['pi', 'hnp', 'ec'], caption: '**pageInfo**: цааш бий юу, хаанаас үргэлжлүүлэх вэ. Дараагийн хуудсыг авахын тулд `endCursor`-ыг `after`-т дамжуул.' },
    { focus: ['tc'], caption: '**totalCount**: үндсэн spec-т ордоггүй ч маш түгээмэл ("24 issue"). Count query шаарддаг тул client сонгосон үед л тооцогдоно… хэрэв resolver-ээ тэгж бичсэн бол.' },
  ],
}
```

Argument-ууд нь convention-оор `first` (хуудасны хэмжээ) ба `after` (cursor). Client талын давталт энгийн:

```graphql-try
query Board($after: String) {
  project(key: "TF") {
    issueConnection(first: 3, after: $after) {
      edges { cursor node { key title } }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
}
---variables---
{ "after": null }
```

Ажиллуул, `endCursor`-ыг `after` руу хуулаад дахин ажиллуул. Apollo Client-ийн `fetchMore` чиний өмнөөс яг үүнийг Module 12-т хийнэ.

### Хоёр дахь query-гүйгээр hasNextPage

Асуусан хэмжээнээсээ **нэгийг илүү** татаарай:

```ts
const docs = await Issue.find(filter).sort({ createdAt: -1, _id: -1 }).limit(first + 1);
const hasNextPage = docs.length > first;
const page = docs.slice(0, first);
```

Илүү нэг нь байвал дараагийн хуудас бий. Зүгээр л түүнийг буцаахгүй.

### Хуудасны хэмжээг хамгаал

`first: 100000` бол denial-of-service request. `first` нь 1-ээс тодорхой дээд хэмжээ (жишээ нь 50) хооронд байхыг шалга, үгүй бол `BAD_USER_INPUT`. Client-ээс хэмжээ авдаг list field бүрт дээд хязгаар хэрэгтэй.

## Schema-г хөгжүүлэх: солихгүй, нэм

Taskforge-д `Project.issues(limit, offset)` аль хэдийн бий, client-үүд (яахав, удахгүй) үүнийг ашиглана. Түүний type-ыг connection болгон өөрчилбөл тэднийг эвдэнэ. Мэргэжлийн арга бол хажууд нь field **нэмэх**:

```graphql
extend type Project {
  issueConnection(filter: IssueFilter, first: Int = 20, after: String): IssueConnection!
}
```

…дараа нь хэн ч хуучныг ашиглахаа больсон үед `@deprecated(reason: "Use issueConnection")` гэж тэмдэглэнэ. Том schema-д илүүдэл шиг харагдах хос field байдаг нь үүнээс: эдгээр нь болгоомжтой migration-уудын үлдээсэн мөр.

```quiz
Q: Issue-ууд `createdAt` буурахаар sort хийгдсэн. Cursor зөвхөн `createdAt`-ийг кодолдог. 30 issue ижил timestamp-тай bulk import хийгдсэн. `first: 10`-аар pagination хийхэд юу болох вэ?
- [ ] Ажиллана, MongoDB тэднийг оруулсан дарааллаар нь хадгалдаг
- [x] Cursor-ын timestamp-ыг хуваалцсан item-ууд алгасагдана (`$lt`-тэй), эсвэл давтагдана (`$lte`-тэй)
- [ ] Алдаа: давхардсан cursor
> Cursor нь ижил timestamp-тай бүлгийн *дотор* байрлалыг илэрхийлж чадахгүй. Sort болон cursor хоёуланд нь давхцахгүй tiebreaker-ийг (`_id`) оруул.
```

```quiz
Q: `first + 1` document яагаад татдаг вэ?
- [x] Хоёр дахь query ажиллуулахгүйгээр `hasNextPage` үнэн эсэхийг мэдэхийн тулд
- [ ] totalCount тооцоолохын тулд
- [ ] Учир нь cursor өөрийн item-ийг оруулдаггүй
> Илүү document байвал өөр хуудас бий. Чи зөвхөн `first`-ийг нь буцаана.
```
