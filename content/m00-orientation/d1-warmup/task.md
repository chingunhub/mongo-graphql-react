---
title: "Warm-up: group the backlog"
kind: drill
summary: Get comfortable with Run, Submit and the test panel.
focus: [board.ts, playground.ts]
needs: [m00/l1-welcome]
---

A quick one so you can feel out the workbench. No databases yet — just data shaping, which you'll do constantly in resolvers.

Here's the kind of thing we mean. Grouping books by genre:

```ts
function groupByGenre(books: Book[]) {
  const groups: Record<string, Book[]> = {};
  for (const book of books) {
    (groups[book.genre] ??= []).push(book);
  }
  return groups;
}
```

## Your task

In `board.ts`, implement `toBoard(issues)`. It turns a flat list of issues into **board columns**, like the Taskforge kanban board will.

```ts
type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
```

Requirements:

1. Return an object with **exactly** the four status keys, **in board order**: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`.
2. **Every** column exists, even if it's empty (`[]`). The example above would skip empty genres — a board can't.
3. Inside each column, issues are sorted by **priority, most urgent first** (`URGENT` → `HIGH` → `MEDIUM` → `LOW`).
4. Issues with the same priority keep their **original relative order**.
5. Don't mutate the input array.

Try it in the playground first (**Run**, or Ctrl+Enter), then **Submit** (Ctrl+Shift+Enter).

## Hints

### Start with the empty board
Build the result object *first*, with all four keys pointing at empty arrays, in order. Then loop the issues and push each into its column. Object key order in JavaScript follows insertion order for string keys.

### Sorting by an enum
Strings like `'HIGH'` don't sort meaningfully. Give each priority a number — e.g. a lookup object `{ URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }` — and sort by that.

### Stability and mutation
`Array.prototype.sort` is stable in modern JavaScript, so equal priorities keep their order automatically. But it sorts **in place** — sort the column arrays you built (which are new arrays), never `issues` itself.
