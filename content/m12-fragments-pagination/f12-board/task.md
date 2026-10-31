---
title: "Taskforge web: the board"
kind: forge
workspace: taskforge
env: dom
summary: An IssueCard that owns its fragment, a cursor-paginated board grouped into columns, a pagination field policy — and the app shell comes alive.
focus: [web/components/IssueCard.tsx, web/components/Board.tsx, web/apollo.ts, web/components/CreateIssueForm.tsx, web/App.tsx]
readonly: [web/App.tsx, web/LoginForm.tsx, web/main.tsx, web/preview.tsx, web/lib/toBoard.ts, web/styles.css]
preview: web/preview.tsx
---

The main screen of Taskforge: a kanban **board** with four columns. Several new provided files arrive with this step — read them, they're the "rest of the codebase" your components plug into:

- `web/App.tsx` — the app shell: login, project tabs, and **your** `CreateIssueForm` + `Board`.
- `web/lib/toBoard.ts` — groups issues into columns by status, most urgent first. Look familiar? **It's your module-0 warm-up**, now doing real work.
- `web/main.tsx` — the real entry point that "Launch" will build in module 13.

**Run preview** now renders the whole app on the reference API.

## Your task

### 1. `web/components/IssueCard.tsx`
- Export the fragment `ISSUE_CARD_FIELDS`: **`fragment IssueCardFields on Issue`** with everything the card renders: `id key title status priority commentCount labels { name color } assignee { id name }`.
- `IssueCard({ issue })` renders an `<article aria-label="TF-12">` (the key) showing the key, title, priority, label names, the assignee's name or `Unassigned`, `N comments` when there are any, and your `<StatusSelect issue={issue} />`.

### 2. `web/components/Board.tsx` — `Board({ projectKey, pageSize = 20 })`
- Export `BOARD_ISSUES`: a query **`BoardIssues($key, $first, $after)`** over `project(key) { id name issueConnection(first, after) { edges { cursor node { ...IssueCardFields } } pageInfo { hasNextPage endCursor } totalCount } }` — with the fragment's definition included.
- Four columns, one `<section aria-label="To do">` (labels from `COLUMNS`) each, with a heading like `To do (3)` and the column's cards — grouped and sorted with `toBoard`.
- `Showing 20 of 24` under the board, and a **`Load more`** button while there's a next page (`Loading more…` and disabled while fetching).
- `Loading board…` only when there's no data yet; errors in an alert (`Couldn't load board: …`).

### 3. `web/apollo.ts` — the cache
Configure `createCache()` so `Project.issueConnection` pages merge into one list per `filter` — use Apollo's `relayStylePagination` (you wrote one by hand in the drill; now you know what it does).

### 4. `web/components/CreateIssueForm.tsx` (yours, from module 11)
New issues must appear **on the board** too. The form currently refetches only `ProjectIssues`…

When you're done: changing a card's status moves it to another column **instantly** — think about why that works without any extra code.

## Hints

### Including the fragment
Interpolate it at the end of the query: `` gql`query BoardIssues(…) { … ...IssueCardFields … } ${ISSUE_CARD_FIELDS}` ``.

### Columns
`const board = toBoard(issues)` gives `{ TODO: [...], IN_PROGRESS: [...], … }`. Map over `COLUMNS` to render them in order.

### Why cards move instantly
The columns are computed from each issue's `status` in the cache on every render. Your StatusSelect's optimistic response changes that status → the Board re-renders → `toBoard` puts the card in its new column. No refetch needed for *this* screen.
