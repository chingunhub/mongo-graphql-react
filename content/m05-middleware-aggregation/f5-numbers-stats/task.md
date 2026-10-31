---
title: "Taskforge: issue numbers and project stats"
kind: forge
workspace: taskforge
db: true
summary: Race-free sequence numbers with an atomic upsert, a static factory, and two aggregations for the dashboard.
focus: [server/models/Counter.ts, server/models/Issue.ts, server/services/stats.ts, playground.ts]
needs: [m03/l2-updates, m05/l2-aggregation]
---

Two features this time.

**Issue numbers.** So far tests created issues with hand-picked numbers. Real Taskforge must assign `TF-1`, `TF-2`, `TF-3`… automatically, per project, with **no duplicates, even when ten people create issues at the same second**. "Find the highest number and add one" has the race from the updates lesson. Instead, a tiny `counters` collection holds one document per sequence and is bumped atomically:

```viz-sequence
{
  actors: [
    { id: 'a', label: 'createInProject (A)', color: 'neutral' },
    { id: 'c', label: 'counters', sub: '{ _id: "issue:TF", seq: 41 }', color: 'mongo' },
    { id: 'b', label: 'createInProject (B)', color: 'neutral' },
  ],
  steps: [
    { from: 'a', to: 'c', label: '$inc seq (upsert, return after)', note: 'A asks for the next number. The increment and the read happen in one atomic operation.' },
    { from: 'b', to: 'c', label: '$inc seq (upsert, return after)', note: 'B asks at the same moment. MongoDB serializes the two updates on that one document.' },
    { from: 'c', to: 'a', label: 'seq: 42', ret: true, note: 'A gets 42…' },
    { from: 'c', to: 'b', label: 'seq: 43', ret: true, note: '…B gets 43. Never the same number twice. `upsert: true` creates the counter document the first time a project needs a number.' },
  ],
}
```

> **What the counter does and doesn't promise.** It guarantees *unique* numbers, not *gap-free* ones. The `$inc` happens before the issue is saved, so if the save then fails, that number is already spent: create, failed create, create gives you `TF-1` and `TF-3`. If every create succeeds, ten of them get 1–10 with no holes, which is what the tests check.
>
> Getting rid of those holes would take a multi-document transaction around the counter and the issue, and every create in a project would then contend for one counter document. Deleting an issue would leave a hole anyway. So this design accepts gaps, the same trade-off SQL sequences make: an issue number is an identifier, not a count.

**Project stats.** The project dashboard shows how many issues are in each column and who's carrying the most open work. Both are aggregations.

## Your task

### 1. `server/models/Counter.ts`

A `Counter` model whose documents look like `{ _id: 'issue:<projectId>', seq: 42 }` (so `_id` is a **string** here, not an ObjectId), and:

- **`nextSequence(name)`** → resolves to the next number for that sequence: `1` the first time, then `2`, `3`…

### 2. `server/models/Issue.ts` — a static

- **`Issue.createInProject(projectId, data)`** — creates an issue in that project with the next number from the sequence `issue:<projectId>`. Any `number` or `project` in `data` is ignored. Resolves to the created issue.

### 3. `server/services/stats.ts`

- **`projectStats(projectId)`** →
  ```ts
  { total: 7, byStatus: [ { status: 'TODO', count: 3 }, { status: 'IN_PROGRESS', count: 2 },
                          { status: 'IN_REVIEW', count: 0 }, { status: 'DONE', count: 2 } ] }
  ```
  All four statuses, **in `STATUSES` order, including zeros**.
- **`workload(projectId)`** → open (not `DONE`) issues per assignee, unassigned issues excluded, with names:
  ```ts
  [ { userId: '66f…', name: 'Grace', open: 3 }, { userId: '66f…', name: 'Ada', open: 1 } ]
  ```
  Sorted by `open` descending, then `name` A→Z.

Both receive `projectId` as a **string** (that's how it will arrive from the API). Remember what aggregation does — and doesn't do — with strings.

## Hints

### The counter
Define `_id: String` in the schema to override the default ObjectId. Then: `Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })` and return `.seq`.

### The static
`issueSchema.statics.createInProject = async function (projectId, data) { const number = await nextSequence(...); return this.create({ ...data, project: projectId, number }); }` — spread `data` first so your `project` and `number` win.

### The aggregations
Cast once: `new mongoose.Types.ObjectId(projectId)`. For stats: `$match` → `$group: { _id: '$status', count: { $sum: 1 } }`, then map `STATUSES` onto the results in JavaScript to fill zeros. For workload: `$match` (project, `status: { $ne: 'DONE' }`, `assignee: { $ne: null }`) → `$group` by `'$assignee'` → `$lookup` from `users` → `$unwind` → `$project` → `$sort: { open: -1, name: 1 }`.
