---
title: "Drill: an optimistic comment thread"
kind: drill
env: dom
summary: cache.modify on an entity's list and count — plus an optimistic comment that appears instantly, never duplicates, and rolls back on error.
focus: [CommentThread.tsx, preview.tsx]
readonly: [preview.tsx]
preview: preview.tsx
---

The issue page's comment thread. The lesson showed how to append to a list with `cache.modify`. Here comments must also appear **the instant** you press Post — before the server answers — which means an optimistic response *and* a manual cache update working together.

## Your task

Build `CommentThread({ issueId, currentUser })` in `CommentThread.tsx`. `currentUser` is `{ id, name }`.

**Showing the thread**
- Query the issue's `commentCount` and `comments { id body author { id name } }` (operation name: **`IssueComments`**).
- A heading with `<count> comments` (e.g. `2 comments`) and a list with one `<li>` per comment reading `Author Name: body`.

**Posting**
- A `<textarea>` labelled **`Comment`** and a button **`Post`**, disabled while the trimmed text is empty.
- Posting calls `addComment(issueId, body)` and:
  - shows the new comment **immediately** (optimistically), with the text `Sending…` in its `<li>` until the server confirms;
  - after the server confirms, the comment is in the list **exactly once**, without `Sending…`;
  - bumps the heading's count by one;
  - clears the textarea;
  - **does not refetch** `IssueComments` — update the cache yourself.
- If posting fails: the optimistic comment disappears, the count goes back, the textarea **keeps** the text (so the user can retry), and an alert (`role="alert"`) shows `Couldn't post comment: <message>`.

## Hints

### The optimistic response
It must be shaped exactly like the real result: `{ addComment: { __typename: 'Comment', id: 'temp-' + Date.now(), body, author: { __typename: 'User', id: currentUser.id, name: currentUser.name } } }`. A temporary id that starts with `temp-` also tells your UI to show `Sending…`.

### One update function, two runs
Apollo calls your `update(cache, { data })` once with the optimistic data (in a throwaway layer) and again with the real data. Inside, `cache.modify({ id: cache.identify({ __typename: 'Issue', id: issueId }), fields: { comments: (refs = [], { toReference }) => [...refs, toReference(data.addComment)], commentCount: (n = 0) => n + 1 } })`. Because the optimistic layer is discarded, the comment doesn't end up twice.

### Keeping the text on failure
Clear the textarea only after `await addComment(...)` resolves. In the `catch`, leave it alone.
