---
title: "Taskforge web: create issues and move them"
kind: forge
workspace: taskforge
env: dom
summary: A create form with validation and refetching, and an optimistic status dropdown that also keeps filtered lists honest.
focus: [web/components/CreateIssueForm.tsx, web/components/StatusSelect.tsx, web/components/IssueList.tsx, web/preview.tsx]
preview: web/preview.tsx
---

Your issue list from module 10 becomes interactive: create issues from the page, and change an issue's status right in its row. Two different cache strategies, chosen per the lesson:

- **Creating** adds an item to filtered lists → let the server decide which lists it belongs in: **refetch**.
- **Changing status** should feel instant → **optimistic** entity update, **plus** a refetch so a filtered list (say "To do") drops an issue that just moved to "Done".

The preview is the same as last time — it renders your `IssueList`, so wire the new components into it and press **Run preview**. (The preview really writes to the reference API; restart the app to reset its demo data.)

## Your task

### 1. `web/components/CreateIssueForm.tsx` — `CreateIssueForm({ projectId })`
- An input labelled **`Title`**, a select labelled **`Priority`** (`LOW`, `MEDIUM`, `HIGH`, `URGENT`; default `MEDIUM`), and a submit button **`Create issue`**.
- If the trimmed title is shorter than 3 characters: show an alert `Title must be at least 3 characters` and **don't** send anything.
- Otherwise call `createIssue` (operation name **`CreateIssue`**) with `{ projectId, title, priority }`; the button is disabled and reads `Creating…` meanwhile.
- After success: refetch `ProjectIssues` (so the new issue shows up), clear the title, reset priority to `MEDIUM`, and show a status message (`role="status"`) `Created TF-7` (the new issue's key).
- On failure: an alert `Couldn't create issue: <message>`.

### 2. `web/components/StatusSelect.tsx` — `StatusSelect({ issue })`
`issue` is `{ id, key, status }`.
- A select labelled **`Status of TF-3`** (with the issue's key) showing the four statuses, current one selected.
- On change: `updateIssue` (operation name **`UpdateIssueStatus`**) with an **optimistic response** so the new status shows instantly, and refetch `ProjectIssues` so filtered lists stay correct.
- On failure: the status snaps back (that's automatic with optimistic responses) and an alert reads `Couldn't update TF-3: <message>`.

### 3. `web/components/IssueList.tsx` (your file)
- Render `<CreateIssueForm projectId={…} />` above the list once the project has loaded.
- Render `<StatusSelect issue={issue} />` in every issue row.

## Hints

### Waiting for the refetch
`useMutation(CREATE_ISSUE, { refetchQueries: ['ProjectIssues'], awaitRefetchQueries: true })` makes the mutation promise resolve only after the list has been refetched — so "Created TF-7" and the new row appear together.

### The optimistic response
`optimisticResponse: { updateIssue: { __typename: 'Issue', id: issue.id, status: newStatus } }` — same shape as your mutation's selection (`{ id status }`).

### The form vanishes after creating?
In Apollo Client 4, `loading` is also `true` while a query **refetches**. If your IssueList returns `Loading issues…` whenever `loading` is true, the refetch unmounts the form (and its success message). Show the loading text only when there's no data yet: `if (loading && !data?.project)`.

### Promises that reject
Calling a mutation function rejects on error. Wrap it in `try/catch`; render the hook's `error` for the alert.
