---
title: "Bug hunt: the board that lies"
kind: bughunt
env: dom
summary: The server is right, the screen is wrong. Three cache bugs, no errors anywhere.
focus: [StatusPicker.tsx, NewIssueForm.tsx, IssueBoard.tsx, preview.tsx]
readonly: [preview.tsx]
preview: preview.tsx
---

> **TICKET-5120 — "The board lies to me"** (priority: high)
>
> 1. I change an issue's status in the dropdown and… it snaps back. If I refresh the page, it shows the new status. So it *did* save?
> 2. When I create an issue, nothing happens. Refresh, and it's there.
> 3. The **Done: N** counter at the top never changes, no matter what I do.
>
> No errors in the console. The API team says every mutation succeeds.

The API team is right: the server is fine. The bugs are all in how the client keeps its cache in sync. Use what you learned about normalization and refetching.

The components: `IssueBoard` (the page), `StatusPicker` (the dropdown on each row) and `NewIssueForm`. Use **Run preview** against the live API to reproduce the bugs yourself first.

## Your task

Fix the three symptoms with the **smallest correct changes**:

1. After changing a status, the dropdown and the row show the new status (no page refresh).
2. A created issue appears in the list.
3. The **Done: N** counter reflects status changes and new issues.

Don't rewrite the components; keep their structure and names.

## Hints

### Symptom 1
What does the `SetStatus` mutation return? Could Apollo know **which** cached issue that result belongs to? What does every object need for normalization?

### Symptom 2
`refetchQueries` matches active queries by **operation name**. Compare the name it asks for with the name of the query that renders the list. Character by character.

### Symptom 3
`Done: N` is `project.issueCount(filter: { status: DONE })` — a number the **server** computes. When an issue's status changes in the cache, can Apollo recompute a server-side count? What's the simplest way to get a fresh one after a status change?
