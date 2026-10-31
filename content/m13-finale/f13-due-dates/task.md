---
title: "Ship it: due dates, through every layer"
kind: forge
workspace: taskforge
env: dom
db: true
summary: One product feature, six files, three layers — the way features actually ship in a big codebase.
focus: [server/models/Issue.ts, server/repositories/issues.ts, server/graphql/schema/issue.ts, server/graphql/resolvers/issue.ts, web/components/IssueCard.tsx, web/components/CreateIssueForm.tsx]
readonly: [server/lib/dates.ts]
---

The product ask:

> **Issues get an optional due date.** Cards show it, and flag overdue issues (past due and not done). People can set it when creating an issue, change or clear it later, and filter the board's lists to overdue issues.

No new files to fill in this time (except a small provided date helper, `server/lib/dates.ts` — read it). Every change goes into code **you** wrote earlier in the course. Work **data → contract → UI**, and run the tests as you go: the server tests will start passing before the UI ones.

## The changes

### Data — `server/models/Issue.ts`, `server/repositories/issues.ts`
- `Issue.dueDate`: a `Date`, default `null`.
- `IssueFilter.overdue: true` → only issues due **before today (UTC)** that aren't `DONE` (use `startOfTodayUTC()`).
- `updateIssue` may now change `dueDate` (your whitelist!), including setting it to `null`.

### Contract — `server/graphql/schema/issue.ts`, `server/graphql/resolvers/issue.ts`
- `Issue.dueDate: String` — a date like `"2026-10-31"`, or `null`.
- `Issue.isOverdue: Boolean!` — due before today (UTC) and not `DONE`.
- `dueDate: String` on `CreateIssueInput` and `UpdateIssueInput`; `overdue: Boolean` on `IssueFilter`.
- Incoming date strings are parsed with `parseDateOnly`; anything invalid → `BAD_USER_INPUT` with `extensions.fields.dueDate`. On update, `dueDate: null` clears it; omitting it leaves it alone.

### UI — `web/components/IssueCard.tsx`, `web/components/CreateIssueForm.tsx`
- The card's fragment gains `dueDate` and `isOverdue`. A card with a due date shows `Due 2026-10-31`, and overdue cards also show `Overdue`.
- The create form gets an `<input type="date">` labelled **`Due date`**; when filled, `createIssue` receives `dueDate`; it resets after creating.

When everything passes: open **⚒ Taskforge** and press **Launch**.

## Hints

### Where's the badInput helper?
In `server/graphql/errors.ts` from module 8: `throw badInput('dueDate must be a date like 2026-10-31', { dueDate: '…' })`.

### Translating in resolvers
Create: `const due = input.dueDate ? parseDateOnly(input.dueDate) : null` (throw if the string was given but parsing failed). Update: only touch `patch.dueDate` when `input.dueDate !== undefined`; `null` stays `null`.

### The fragment pays off
Adding two fields to `IssueCardFields` is the only query change on the client — the board query picks them up automatically. That's Module 12's argument, demonstrated.
