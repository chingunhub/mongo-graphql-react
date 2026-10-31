---
title: "Taskforge: projects, issues and unique indexes"
kind: forge
workspace: taskforge
db: true
summary: The two central models of Taskforge, with validation, embedded labels and real uniqueness.
focus: [server/models/Project.ts, server/models/Issue.ts, server/models/User.ts, playground.ts]
needs: [m02/l1-validation, m02/l2-subdocuments]
---

Taskforge's core domain is now taking shape. A **project** (key `TF`, "Taskforge") contains **issues** (`TF-1`, `TF-2`…). Each issue has a status on the board, a priority, a reporter, maybe an assignee, and a few colored labels.

```viz-flow
{
  colWidth: 200,
  rowHeight: 86,
  nodes: [
    { id: 'u', label: 'User', sub: 'users', col: 0, row: 0, color: 'mongo' },
    { id: 'p', label: 'Project', sub: 'projects', col: 1, row: 0, color: 'mongo' },
    { id: 'i', label: 'Issue', sub: 'issues', col: 2, row: 0, color: 'mongo' },
    { id: 'l', label: 'labels[]', sub: 'embedded in Issue', col: 2, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'p', to: 'u', label: 'owner, members' },
    { from: 'i', to: 'p', label: 'project' },
    { from: 'i', to: 'u', label: 'reporter, assignee', dashed: true },
    { from: 'i', to: 'l' },
  ],
}
```

References to other documents are stored as **ObjectIds**. In a schema that's `{ type: Schema.Types.ObjectId, ref: 'User' }` — `ref` names the model it points to. You'll learn to *follow* these references in Module 4; for now, just store them.

## Your task

### 1. `server/models/Project.ts` → export `Project` (model `'Project'`)

| Field | Rules |
| --- | --- |
| `name` | string, required, trimmed, max 80 characters |
| `key` | string, required, trimmed, **uppercased**, exactly 2–5 letters A–Z, **unique**. Message when the pattern fails: `Project key must be 2–5 letters` |
| `description` | string, defaults to `''` |
| `owner` | ObjectId → `User`, required |
| `members` | array of ObjectIds → `User` |

### 2. `server/models/Issue.ts` → export `Issue`, `STATUSES`, `PRIORITIES`

```ts
export const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
```

| Field | Rules |
| --- | --- |
| `project` | ObjectId → `Project`, required |
| `number` | number, required, at least 1 (the `12` in `TF-12`) |
| `title` | string, required, trimmed, 3–120 characters |
| `description` | string, defaults to `''` |
| `status` | one of `STATUSES`, default `TODO` |
| `priority` | one of `PRIORITIES`, default `MEDIUM` |
| `labels` | array of **label subdocuments without their own `_id`**: `name` (required, trimmed, lowercased, max 30) and `color` (a hex color like `#ff8800`, default `#888888`; message: `Color must be a hex value like #ff8800`) |
| `assignee` | ObjectId → `User`, defaults to `null` |
| `reporter` | ObjectId → `User`, required |

Both models get timestamps.

**Uniqueness:** an issue's `number` is unique **within its project** — `TF-1` and `API-1` can both exist, two `TF-1`s cannot. That's a compound unique index.

### 3. Back in `server/models/User.ts`

Make `email` **unique**. (Your User model from module 1 is right there — you're editing your own code now.)

> [!NOTE]
> The tests build your indexes before checking uniqueness (like a deploy script would). Duplicates must be rejected by MongoDB itself — a `findOne` check before saving won't pass, for the reasons in the lesson.

## Hints

### The key pattern
`match: [/^[A-Z]{2,5}$/, 'message']`. Setters (`uppercase`, `trim`) run **before** validation, so `' tf '` becomes `'TF'` and then passes.

### Labels without _id
Define `const labelSchema = new Schema({ ... }, { _id: false })` and use `labels: [labelSchema]`. For the color: `/^#[0-9a-fA-F]{6}$/`.

### Compound unique index
Indexes over several fields are declared on the schema, not on a field: `issueSchema.index({ project: 1, number: 1 }, { unique: true })`.
