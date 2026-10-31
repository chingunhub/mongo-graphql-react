---
title: "Taskforge: issue дугаар ба project stats"
summary: Atomic upsert-ээр race-гүй дугаар, static factory, мөн dashboard-д зориулсан хоёр aggregation.
source: 54ab14473943ec39fb3ff036dbde10c5f552f020f9b3ebcbde11138d0f111b50
---

Энэ удаа хоёр боломж байна.

**Issue дугаар.** Одоохондоо тестүүд issue-г гараар сонгосон дугаартай үүсгэж байсан. Жинхэнэ Taskforge `TF-1`, `TF-2`, `TF-3`… дугаарыг project тус бүрд автоматаар олгох ёстой, мөн **арван хүн яг нэг секундэд issue үүсгэсэн ч давхцахгүй**. "Хамгийн их дугаарыг ол, нэгийг нэм" гэдэг нь updates хичээлд үзсэн race-тэй. Оронд нь жижигхэн `counters` collection sequence тус бүрд нэг document барьж, түүнийг atomic байдлаар нэмэгдүүлнэ:

```viz-sequence
{
  actors: [
    { id: 'a', label: 'createInProject (A)', color: 'neutral' },
    { id: 'c', label: 'counters', sub: '{ _id: "issue:TF", seq: 41 }', color: 'mongo' },
    { id: 'b', label: 'createInProject (B)', color: 'neutral' },
  ],
  steps: [
    { from: 'a', to: 'c', label: '$inc seq (upsert, return after)', note: 'A дараагийн дугаарыг гуйна. Нэмэгдүүлэх, унших хоёр нэг atomic operation-д хийгдэнэ.' },
    { from: 'b', to: 'c', label: '$inc seq (upsert, return after)', note: 'B яг тэр үед гуйна. MongoDB тэр ганц document дээрх хоёр update-ийг дарааллуулна.' },
    { from: 'c', to: 'a', label: 'seq: 42', ret: true, note: 'A 42 авна…' },
    { from: 'c', to: 'b', label: 'seq: 43', ret: true, note: '…B 43 авна. Нэг дугаар хэзээ ч хоёр удаа гарахгүй. `upsert: true` нь project анх дугаар хэрэгтэй болоход counter document-ыг үүсгэнэ.' },
  ],
}
```

> **Counter юуг амладаг, юуг амладаггүй вэ.** Энэ нь *давхцахгүй* дугаарыг баталгаажуулдаг, харин *завсаргүй* дугаарыг биш. `$inc` нь issue хадгалагдахаас өмнө хийгддэг тул дараа нь save унавал тэр дугаар аль хэдийн зарцуулагдсан байна: create, бүтэлгүйтсэн create, create гэвэл `TF-1` ба `TF-3` гарна. Create бүр амжилттай бол арван issue 1–10 гэж завсаргүй дугаарлагдана, тестүүд үүнийг шалгана.
>
> Эдгээр завсрыг арилгахад counter болон issue-г хамарсан олон document-ын transaction хэрэгтэй. Тэгвэл project доторх create бүр нэг counter document-ын төлөө өрсөлдөнө. Issue устгахад ч ямар ч байсан завсар үлддэг. Тиймээс энэ загвар завсрыг зөвшөөрсөн, SQL sequence-тэй ижил trade-off. Issue дугаар бол танигч, тооллого биш.

**Project stats.** Project dashboard нь column бүрд хэдэн issue байгааг, мөн хэн хамгийн их нээлттэй ажил үүрч байгааг харуулдаг. Хоёулаа aggregation.

## Даалгавар

### 1. `server/models/Counter.ts`

Document нь `{ _id: 'issue:<projectId>', seq: 42 }` хэлбэртэй `Counter` model (тэгэхээр энд `_id` нь ObjectId биш, **string**), мөн:

- **`nextSequence(name)`** → тэр sequence-ийн дараагийн дугаараар resolve болно: эхний удаа `1`, дараа нь `2`, `3`…

### 2. `server/models/Issue.ts` — static

- **`Issue.createInProject(projectId, data)`** — тэр project-д `issue:<projectId>` sequence-ийн дараагийн дугаартай issue үүсгэнэ. `data` доторх `number`, `project`-ийг үл тооно. Үүссэн issue-ээр resolve болно.

### 3. `server/services/stats.ts`

- **`projectStats(projectId)`** →
  ```ts
  { total: 7, byStatus: [ { status: 'TODO', count: 3 }, { status: 'IN_PROGRESS', count: 2 },
                          { status: 'IN_REVIEW', count: 0 }, { status: 'DONE', count: 2 } ] }
  ```
  Дөрвөн status бүгд, **`STATUSES`-ийн дарааллаар, тэгүүдтэй нь хамт**.
- **`workload(projectId)`** → assignee тус бүрийн нээлттэй (`DONE` биш) issue-ийн тоо. Assign хийгээгүй issue-г оруулахгүй, нэрийг нь хамт гаргана:
  ```ts
  [ { userId: '66f…', name: 'Grace', open: 3 }, { userId: '66f…', name: 'Ada', open: 1 } ]
  ```
  `open`-оор буурахаар, тэнцвэл `name`-ээр A→Z sort хийгдсэн.

Хоёулаа `projectId`-г **string**-ээр авна (API-аас ингэж ирэх болно). Aggregation string-тэй юу хийдэг, юу хийдэггүйг санаарай.

## Hints

### Counter
Default ObjectId-г дарахын тулд schema-д `_id: String` зарла. Дараа нь: `Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })` ажиллуулаад `.seq`-ийг буцаа.

### Static
`issueSchema.statics.createInProject = async function (projectId, data) { const number = await nextSequence(...); return this.create({ ...data, project: projectId, number }); }` — `data`-г эхэнд нь spread хий, тэгвэл чиний `project`, `number` давамгайлна.

### Aggregation
Нэг удаа cast хий: `new mongoose.Types.ObjectId(projectId)`. Stats-д: `$match` → `$group: { _id: '$status', count: { $sum: 1 } }`, дараа нь тэгүүдийг нөхөхийн тулд JavaScript дээр `STATUSES`-ийг үр дүн рүү map хий. Workload-д: `$match` (project, `status: { $ne: 'DONE' }`, `assignee: { $ne: null }`) → `'$assignee'`-ээр `$group` → `users`-аас `$lookup` → `$unwind` → `$project` → `$sort: { open: -1, name: 1 }`.
