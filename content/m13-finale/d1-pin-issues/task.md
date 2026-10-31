---
title: "From a brief: pin issues"
kind: drill
base: taskforge
env: dom
db: true
summary: A product brief, no file list and no step-by-step. Ship it through every layer, then write the change note.
focus: [CHANGE_NOTE.md, playground.ts]
---

The last job in Taskforge. This is everything you get from product:

> **Pinned issues.** Our teams lose track of the few issues that matter most this week. Project members should be able to pin an issue so it stays at the top of its column. Keep it to **three pins per project**, because if everything is pinned, nothing is.

Nobody's going to list the files for you. Work out which layers this touches, and build it the way you built due dates. The contract below is the part other code depends on, so the tests hold you to those exact names. Everything between them is your call.

### The contract

| Part | Must be |
| --- | --- |
| `Issue.pinned` | `Boolean!`, `false` unless someone pinned it, including issues created before this feature |
| `setIssuePinned(id: ID!, pinned: Boolean!): Issue!` | The same rules as your other issue mutations: `UNAUTHENTICATED`, then `NOT_FOUND`, then `FORBIDDEN` |
| The limit | A fourth pin in a project is `BAD_USER_INPUT` and changes nothing. Unpinning always works. Pinning an issue that's already pinned is fine at the limit. |
| `Project.pinnedIssues` | `[Issue!]!`, newest first |
| The card | A button named `Pin TF-2` or `Unpin TF-2`, and the text `Pinned` on a pinned card |
| The board | Pinned cards first in their column, with the rest in the order they had. It updates without a reload, and a refused pin shows the server's message in a `role="alert"` element. |

### The change note

Fill in `CHANGE_NOTE.md`, for whoever reads this code next. The module's last lesson has an example.

An honest word on grading: the tests can only check that each section has real sentences in it. They can't judge whether the note is any good, so that part is between you and future you. Before you call it done, read "What it does not do yet" and ask whether you really looked for the edges. There's at least one interesting one in the limit.

This task's changes stay separate from your forge steps, and once it passes, your launched app includes the feature.

## Hints

### Where do I even start?

List the layers before you open anything: where's the value stored, what's the API contract, who enforces the limit, and which components render it? You did all of this for due dates, so that task's files are a good map.

### The limit

Check it on the server, inside the mutation. The UI can't enforce it, because two people can have the board open. Think about which cases must get past the check: unpinning, and pinning something already pinned.

### The board

`toBoard` is read-only, and it already sorts each column. You don't need to change it: split each column it gives you into pinned and the rest, and each part keeps its order.

### Updating without a reload

If your mutation returns `id` and `pinned`, what does Apollo's normalized cache do with that? Compare what you get for free here with the work a created issue needed in module 11.
