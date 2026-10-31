---
title: "Incident: the name that wouldn't change"
kind: bughunt
base: taskforge
db: true
summary: A teammate's performance PR landed on your finished Taskforge. Two reports came in. Nobody tells you where to look.
focus: [playground.ts]
---

This is your Taskforge: everything you built, plus one merged pull request from a teammate.

> **PR #212, "Make the API cheaper"** (merged Friday)
>
> Stop rebuilding things we can reuse between requests. Also makes the cursors shorter, so board URLs look nicer.

The dashboards looked great on Friday. On Monday, two reports arrived:

> **INC-88: "Support changed a customer's name and the board still shows the old one."** (priority: high)
>
> It happens with comment counts too: people add a comment and the number stays where it was. Restarting the server clears it, for a while.

> **INC-91: "Issues are missing from the board."** (priority: high)
>
> After Thursday's bulk import, Load more skips issues. They're still in the database, and they show up in the search box.

Nothing crashes, and no test failed when the PR went in. That's what makes this kind of bug expensive: the system is confidently wrong.

There's no file list this time. Run the playground, which reproduces both reports, then find the cause yourself. You've seen both of these ideas before, in your own code.

## Your task

Keep the performance gain, and fix the behavior:

1. A change made between two requests shows up on the very next request, for names and for comment counts.
2. One request still loads each user once, however many issues mention them. The board's query count stays flat as issues are added.
3. Paging through a project returns every issue exactly once, even when many share the same `createdAt`.
4. Newest first stays the order, `hasNextPage` stays honest, and a garbage cursor is still `BAD_USER_INPUT`.

This PR touches only this task's copy of your project. Your Taskforge stays as you left it, and once this task passes, the launched app uses your fixed version.

## Hints

### Start from what changed

You have a PR description and two symptoms. "Reusing things between requests" and "cursors got shorter" are both claims you can check. Search `server/graphql` for what the PR would have to touch.

### INC-88

A restart clears it, so the old value lives in memory rather than in the database. What in this server keeps values in memory, and how long should it live? The second lesson of module 9 had a strong opinion on this.

### INC-91

Thursday's import created thousands of issues in the same millisecond. Write down what "the next page" means when the cursor only says *a moment in time*. Which issues does that throw away?

### The two files

`server/graphql/loaders.ts`: `createLoaders` must build new loaders on every call, because each request gets its own set. `server/graphql/pagination.ts`: the cursor needs both sort keys, `createdAt` and `_id`, and the query needs the tiebreak: older than the cursor, or the same time with a smaller `_id`.
