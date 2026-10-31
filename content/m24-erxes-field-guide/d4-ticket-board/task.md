---
title: 'Drill: a ticket board with three owners'
kind: drill
env: dom
focus: ['TicketBoard.tsx', 'useQueryState.ts', 'state.ts']
---

Open almost any list page in erxes and you'll find three kinds of state in one screen: rows from the server, filters in the URL, and selections in Jotai. The job here is keeping each in its proper place. Get that right and everything else follows: a pasted link opens the same view, and sorting can't scramble what you've selected.

```viz-tree
{
  title: 'Who owns what on this screen',
  root: {
    id: 'board', label: 'TicketBoard', color: 'react',
    children: [
      { id: 'props', label: 'tickets', value: 'props: the server\'s rows', color: 'gql' },
      { id: 'url', label: 'priority', value: 'URL: shareable', color: 'forge' },
      { id: 'atom', label: 'selected IDs', value: 'Jotai: survives remounts', color: 'mongo' },
      { id: 'local', label: 'sorting', value: 'component state: disposable', color: 'neutral' },
    ],
  },
  steps: [
    { focus: ['board', 'props'], caption: 'The rows arrive as props. In a real page, they would come from Apollo.' },
    { focus: ['url'], caption: 'Someone pastes the link. They should see the same filter.' },
    { focus: ['atom'], caption: 'A selection outlives this component, so that a toolbar elsewhere could read it.' },
    { focus: ['local'], caption: 'Sorting only matters here, so TanStack Table can hold it in component state.' },
  ],
}
```

## Your task

### 1. `useQueryState(key)` in `useQueryState.ts`

Return `[value, setValue]`. `value` is the URL parameter, or `null`. `setValue(text)` sets it, and `setValue(null)` removes it. **Other parameters must survive.**

### 2. `selectedTicketIdsAtom` in `state.ts`

An atom of `string[]`, starting empty.

### 3. `TicketBoard({ tickets })` in `TicketBoard.tsx`

Each ticket has `{ _id, subject, priority }`.

| Part | Requirement |
| --- | --- |
| Table | A `<table>` built with `useReactTable`. Columns are a checkbox, subject and priority, with the subject in the second cell |
| Sorting | A `Subject` button in the header. Clicks toggle ascending, then descending |
| Filter | A `<select aria-label="Priority">` with options `All` (empty value), `high` and `normal`, bound to `?priority=` |
| Selection | Checkboxes labeled `` Select ${subject} ``, stored as ticket IDs in the atom |
| Count | `N selected` in `role="status"`, counting selected tickets, even hidden ones |
| Empty | `No tickets match` in place of the table, with the filter still on screen |

```text
/tickets?priority=high&page=2   choose All   /tickets?page=2
```

## Hints

### Sorting the row model
What does a table need to produce sorted rows? And where does it read the current sort from?

### Keeping a selected ticket selected
Check a row, sort, and look at which row is checked. What identity does TanStack give a row by default?

### Filtering
Should the filter be done by the table, or before the data reaches it? Either is fine here. Just be sure that the empty message is based on the filtered list.
