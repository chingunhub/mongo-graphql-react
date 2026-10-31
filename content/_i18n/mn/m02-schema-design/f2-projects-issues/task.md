---
title: "Taskforge: project, issue ба unique index"
summary: Taskforge-ийн хоёр гол model, validation, embed хийсэн label-ууд, жинхэнэ unique байдалтай.
source: bb1209b7bcfd42e3eaf47c420800aa49ba4329a36023909a78f6e58fa54b7358
---

Taskforge-ийн үндсэн domain одоо тодорч байна. **Project** (key нь `TF`, "Taskforge") олон **issue**-г (`TF-1`, `TF-2`…) агуулна. Issue бүр board дээрх status, priority, reporter, магадгүй assignee, мөн хэдэн өнгөт label-тэй.

```viz-flow
{
  colWidth: 200,
  rowHeight: 86,
  nodes: [
    { id: 'u', label: 'User', sub: 'users', col: 0, row: 0, color: 'mongo' },
    { id: 'p', label: 'Project', sub: 'projects', col: 1, row: 0, color: 'mongo' },
    { id: 'i', label: 'Issue', sub: 'issues', col: 2, row: 0, color: 'mongo' },
    { id: 'l', label: 'labels[]', sub: 'Issue дотор embed хийсэн', col: 2, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'p', to: 'u', label: 'owner, members' },
    { from: 'i', to: 'p', label: 'project' },
    { from: 'i', to: 'u', label: 'reporter, assignee', dashed: true },
    { from: 'i', to: 'l' },
  ],
}
```

Бусад document руу заасан reference-үүд **ObjectId** хэлбэрээр хадгалагддаг. Schema дээр `{ type: Schema.Types.ObjectId, ref: 'User' }` гэж бичнэ, `ref` нь заасан model-ийнхоо нэр. Эдгээр reference-ийг *дагаж* ажиллахыг Module 4-д сурна, одоохондоо зөвхөн хадгал.

## Даалгавар

### 1. `server/models/Project.ts` → `Project`-ийг export хий (model `'Project'`)

| Field | Дүрэм |
| --- | --- |
| `name` | string, required, trim хийгдсэн, 80 тэмдэгтээс хэтрэхгүй |
| `key` | string, required, trim хийгдсэн, **uppercase хийгдсэн**, A–Z-ийн яг 2–5 үсэг, **unique**. Pattern таараагүй үеийн мессеж: `Project key must be 2–5 letters` |
| `description` | string, default нь `''` |
| `owner` | ObjectId → `User`, required |
| `members` | `User` руу заасан ObjectId-уудын array |

### 2. `server/models/Issue.ts` → `Issue`, `STATUSES`, `PRIORITIES`-ийг export хий

```ts
export const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
```

| Field | Дүрэм |
| --- | --- |
| `project` | ObjectId → `Project`, required |
| `number` | number, required, 1-ээс багагүй (`TF-12` доторх `12`) |
| `title` | string, required, trim хийгдсэн, 3–120 тэмдэгт |
| `description` | string, default нь `''` |
| `status` | `STATUSES`-ийн аль нэг, default нь `TODO` |
| `priority` | `PRIORITIES`-ийн аль нэг, default нь `MEDIUM` |
| `labels` | **өөрийн `_id`-гүй label subdocument**-уудын array: `name` (required, trim, lowercase хийгдсэн, 30-аас хэтрэхгүй) ба `color` (`#ff8800` шиг hex өнгө, default нь `#888888`; мессеж: `Color must be a hex value like #ff8800`) |
| `assignee` | ObjectId → `User`, default нь `null` |
| `reporter` | ObjectId → `User`, required |

Хоёр model-д timestamp тавь.

**Unique байдал:** issue-ийн `number` **өөрийн project дотроо** unique. `TF-1`, `API-1` хоёр зэрэгцэн байж болох ч хоёр `TF-1` байж болохгүй. Энэ бол compound unique index.

### 3. Дахин `server/models/User.ts` дотор

`email`-ийг **unique** болго. (Module 1-ийн User model чинь яг тэнд байгаа, одоо чи өөрийнхөө кодыг засаж байна.)

> [!NOTE]
> Тест нь unique байдлыг шалгахаасаа өмнө чиний index-үүдийг бүтээнэ (deploy script шиг). Давхардлыг MongoDB өөрөө няцаах хэрэгтэй: хадгалахын өмнөх `findOne` шалгалт хичээлд заасан шалтгаанаар тестийг давахгүй.

## Hints

### Key-ийн pattern
`match: [/^[A-Z]{2,5}$/, 'message']`. Setter-ууд (`uppercase`, `trim`) validation-аас **өмнө** ажилладаг тул `' tf '` нь `'TF'` болж, дараа нь шалгалтыг давна.

### _id-гүй label-ууд
`const labelSchema = new Schema({ ... }, { _id: false })` гэж зарлаад `labels: [labelSchema]` гэж ашигла. Өнгөнд: `/^#[0-9a-fA-F]{6}$/`.

### Compound unique index
Хэд хэдэн field дээрх index-ийг field дээр биш, schema дээр зарладаг: `issueSchema.index({ project: 1, number: 1 }, { unique: true })`.
