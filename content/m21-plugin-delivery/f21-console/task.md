---
title: "Relaydesk: an operations panel with honest states"
kind: "forge"
workspace: "relaydesk"
env: "dom"
summary: "Render counts, delivery failures and recovery using the same API as the running project."
focus: ["web/OperationsPanel.tsx"]
preview: "web/preview.tsx"
readonly: ["web/preview.tsx"]
---

Your dispatcher and report exist, and they've only ever been seen by tests. This panel puts them in front of an operator, and it's the first screen in this course that has to show a *partial* failure. Three delivered, one still pending, try again. Run the preview once you've got something on the screen, and press "Simulate outage".

```viz-flow
{
  title: 'What the panel can be doing',
  colWidth: 185,
  rowHeight: 92,
  nodes: [
    { id: 'loading', label: 'Loading', sub: 'no report, no error', col: 0, row: 0, color: 'neutral' },
    { id: 'ready', label: 'Showing counts', sub: 'actions enabled', col: 1, row: 0, color: 'forge' },
    { id: 'failed', label: 'Report failed', sub: 'alert + Refresh', col: 0, row: 1, color: 'neutral' },
    { id: 'busy', label: 'Dispatching', sub: 'actions disabled', col: 2, row: 0, color: 'gql' },
    { id: 'after', label: 'Refetched', sub: 'delivered or still pending', col: 2, row: 1, color: 'forge' },
  ],
  edges: [
    { from: 'loading', to: 'ready' },
    { from: 'loading', to: 'failed' },
    { from: 'failed', to: 'loading', dashed: true, label: 'Refresh' },
    { from: 'ready', to: 'busy' },
    { from: 'busy', to: 'after' },
    { from: 'after', to: 'ready', dashed: true },
  ],
  steps: [
    { focus: ['loading', 'loading>failed', 'failed', 'failed>loading'], caption: 'A panel that fails its first load has to be able to get out again, with no reload.' },
    { focus: ['ready', 'ready>busy', 'busy'], caption: 'While work runs, the buttons are disabled. A second click would only confuse things.' },
    { focus: ['busy>after', 'after'], caption: 'The status comes from what the dispatcher actually reported, and the counts come from a fresh report.' },
  ],
}
```

## Your task

Implement `OperationsPanel({ api })` in `web/OperationsPanel.tsx`, using the supplied `OperationsApi`.

### 1. Load

Call `api.report()` on mount and whenever `api` changes.

| State | Show |
| --- | --- |
| No result and no error yet | `Loading operations` in `role="status"` |
| A report | `Tickets`, `Pending` and `Activities` with their counts, in a `dl` with `dt` and `dd` |
| An error | the message in `role="alert"` |

A response from an old `api` must be discarded. The host also keys this panel by tenant, but don't rely on that.

### 2. Act

Add three buttons:

| Button | Does |
| --- | --- |
| `Deliver pending` | `api.dispatch(false)` |
| `Simulate outage` | `api.dispatch(true)` |
| `Refresh` | refetches and clears stale errors |

After a dispatch, await it, refetch the report, and show a status containing `delivered` when nothing failed, or `still pending` when something did.

### 3. Stay honest

- The first two buttons are disabled during an operation and until a report exists.
- `Refresh` has to stay available after a failed first report.
- No failure, in a report or a dispatch, may become an unhandled rejection.

## Hints

### One effect or two?
Refresh does the same job as mounting. What could you change, so that one effect handles both?

### Dispatch can fail after succeeding
The dispatch may work and the following report may fail. How does your `try` cover both, and which `finally` releases the buttons?

### Which counts do you trust?
After a dispatch, you know what the dispatcher said. Where do the numbers on screen come from?
