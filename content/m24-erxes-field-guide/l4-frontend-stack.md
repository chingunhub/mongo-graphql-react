---
title: 'The erxes frontend: who owns this state?'
minutes: 30
---

Open a list page in erxes and count what's going on. Rows from the server. A search box whose value survives a refresh. Checkboxes on some of the rows. A side sheet showing one deal. A sticky table header. Text in the user's language. And the page itself was loaded at runtime, from a different build, into a host app that's never heard of it.

That sounds like a lot, and it's mostly one idea. You met it in Module 23: **every piece of state has exactly one owner.** This lesson maps that idea onto the libraries you'll actually see in erxes, and it covers the promises I made back in Modules 21 and 23.

Here's how often these things turn up in the frontend at this revision, so you know where to spend your attention:

| Thing | Files | What it's for |
| --- | --- | --- |
| `erxes-ui` | 2574 | Shared design system and table, form and state helpers |
| `@apollo/client` | 1249 | Server data |
| `ui-modules` | 693 | Shared feature components |
| `jotai` | 553 | Client state |
| `react-router` | 492 | URLs |
| `react-hook-form` | 471 | Forms |
| `zod` | 219 | Form validation |
| `i18next` | 129 | Translations |
| `@tanstack/react-table` | 98 | Tables |

## Three owners, one question

When you need to store something, the question isn't "which library?" It's "**who should own this?**"

```viz-flow
{
  title: 'Choosing an owner',
  colWidth: 230,
  rowHeight: 92,
  nodes: [
    { id: 'q', label: 'Where is the truth?', col: 0, row: 1, color: 'neutral' },
    { id: 's', label: 'On the server', sub: 'Apollo cache', col: 1, row: 0, color: 'gql' },
    { id: 'u', label: 'Should a link keep it?', sub: 'Filters, page, open tab', col: 1, row: 1, color: 'forge' },
    { id: 'j', label: 'Shared by far-apart components', sub: 'Jotai atom', col: 1, row: 2, color: 'react' },
    { id: 'l', label: 'Used by one component', sub: 'useState', col: 2, row: 2, color: 'neutral' },
  ],
  edges: [
    { from: 'q', to: 's', label: 'server' },
    { from: 'q', to: 'u', label: 'client' },
    { from: 'u', to: 'j', label: 'no' },
    { from: 'j', to: 'l', dashed: true, label: 'nearby only' },
  ],
  steps: [
    { focus: ['q', 'q>s', 's'], caption: 'If the server has it, Apollo owns it. Copying rows into an atom gives you a sync problem.' },
    { focus: ['q>u', 'u'], caption: 'If reload or a shared link should keep it, the URL owns it.' },
    { focus: ['u>j', 'j'], caption: 'Selected rows, an open sheet: client-only, and needed by components that aren\'t neighbors.' },
    { focus: ['j>l', 'l'], caption: 'Don\'t reach for a global when a local will do.' },
  ],
}
```

### Jotai: small pieces of shared state

Redux has one big store. Jotai has **atoms**: small independent pieces of state, each usually declared on one line. Here's real code:

```ts title="frontend/core-ui/src/modules/notification/states/notificationState.tsx"
export const refetchNewNotificationsState = atom(false);
export const hiddenNotificationIdsState = atom<string[]>([]);
export const nextNotificationIdState = atom<string | null>(null);
```

You'll see three hooks, and they're easy to pick between:

| Hook | Gives you | Re-renders when it changes? |
| --- | --- | --- |
| `useAtom(a)` | `[value, setValue]` | Yes |
| `useAtomValue(a)` | Value only | Yes |
| `useSetAtom(a)` | Setter only | **No** |

That last row is a real performance tool. A checkbox that only *sets* a selection doesn't need to re-render every time the selection changes, so it should use `useSetAtom`.

The best part of Jotai is **derived atoms**: an atom computed from others. It updates by itself, and it can't drift, because it isn't stored anywhere.

```ts
// @worked-example derived-atom
import { atom, createStore } from 'jotai';

export const selectedIdsState = atom<string[]>([]);

export const selectedCountState = atom((get) => get(selectedIdsState).length);

export const toggleIdState = atom(null, (get, set, id: string) => {
  const current = get(selectedIdsState);
  set(
    selectedIdsState,
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
  );
});

export const makeStore = () => createStore();
```

`selectedCountState` has only a read function, so it's read-only. `toggleIdState` is the reverse: a write-only atom, a named action with `null` as its value. And `createStore` is how you get a store outside React, which makes atoms straightforward to test.

> [!WARNING] Atoms are global to the provider, and they outlive a screen
> An atom declared at module level holds its value when a component unmounts. That's handy for a sidebar, and a bug for "selected rows": leave the page, come back, and your old selection is still there, maybe for rows that aren't on this page anymore. Decide when an atom resets, and do it deliberately. Also think about what's in one after a user switches workspace.

### The URL as state

erxes has a small hook for this, and it's the one you'll write in the drill:

```ts title="frontend/libs/erxes-ui/src/hooks/use-query-state.tsx (trimmed)"
export function useQueryState<T>(queryKey: string, options?: { defaultValue?: T }): QueryState<T> {
  const [searchParams, setSearchParams] = useSearchParams();

  // Falls back to the default, then parses JSON, 'true' and 'false'.
  const query = parseQueryValue(searchParams.get(queryKey));

  const setQuery = (value: T | null) => {
    if (value !== null && value !== query) {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      searchParams.set(queryKey, stringValue);
    } else if (value === null && query !== null) {
      searchParams.delete(queryKey);
    } else {
      return;
    }

    setSearchParams(searchParams);
  };

  return [query, setQuery];
}
```

So `useQueryState('status')` works like `useState`, and the value lives in the address bar. A refresh keeps the filter, and a link to a colleague shows them the same list. The back button works, too. Those are three features you didn't have to build.

The watch-out is that **a URL is a string that users can edit.** `?status=banana` will reach your code, so treat it like any other input: validate it and fall back to a default.

## Tables: logic without markup

`@tanstack/react-table` is what's called headless: it holds the logic (columns, sorting, selection) and draws nothing. You supply the markup. erxes wraps it in `RecordTable`, so at most call sites you won't touch TanStack directly:

```tsx title="frontend/plugins/accounting_ui: AdjustTable.tsx (trimmed)"
<RecordTable.Provider columns={columns} data={rows} stickyColumns={[]}>
  <RecordTable.Scroll>
    <RecordTable>
      <RecordTable.Header />
      <RecordTable.Body>
        <RecordTable.RowList />
        {!loading && totalCount > rows.length && (
          <RecordTable.RowSkeleton rows={4} handleInView={handleFetchMore} />
        )}
      </RecordTable.Body>
    </RecordTable>
  </RecordTable.Scroll>
</RecordTable.Provider>
```

Look at that `RowSkeleton`. When it scrolls into view it calls `handleFetchMore`. That's cursor pagination from Module 12, with a nicer trigger. When you're adding a list page, find one like this and copy the shape. You should only need to write `columns`.

And `erxes-ui` is the first place to look before writing any UI. With 2574 files importing it, there's almost certainly already a component for what you're about to build. Copying one that's in there is good. Rewriting one is what reviewers will ask you to undo.

## Text is translated

You won't see much hard-coded English:

```tsx
const { t } = useTranslation('automations');

return <Button>{t('save')}</Button>;
```

`'automations'` is a namespace, one file of strings for each area. Adding a visible string means adding a key too. Forgetting it usually doesn't crash anything. It just shows the raw key, or English in a Mongolian interface. So check the screen in a second language once, because that's the only way to catch it.

## Module Federation: the plugin UIs

Here's the Module 21 promise. In Relaydesk you loaded plugins with a plain dynamic import and an injected loader, and you learned the failure contract: a broken plugin must stay inside its boundary. erxes does this with Module Federation, which lets one build load code from another build **at runtime**.

There's one host and many remotes:

```ts title="frontend/plugins/sales_ui/module-federation.config.ts"
const config = {
  name: 'sales_ui',
  exposes: {
    './config': './src/config.tsx',
    './sales': './src/modules/Main.tsx',
    './dealsSettings': './src/pages/SalesSettingsIndexPage.tsx',
    './Widgets': './src/widgets/Widgets.tsx',
    // ...
  },
  // ...
};
```

`exposes` is a public list: these files may be loaded from outside. The host, `core-ui`, turns `ENABLED_PLUGINS` into a list of remotes, `sales_ui` and so on, then imports them while the app is running.

```viz-sequence
{
  title: 'The host loads a plugin at runtime',
  actors: [
    { id: 'b', label: 'Browser', color: 'react' },
    { id: 'h', label: 'core-ui', sub: 'host', color: 'forge' },
    { id: 'r', label: 'sales_ui', sub: 'remote', color: 'gql' },
  ],
  steps: [
    { from: 'b', to: 'h', label: 'open app', note: 'The host boots, and it knows the enabled plugins.' },
    { from: 'h', to: 'r', label: 'fetch ./config', note: 'A small file saying what this plugin adds: its nav items, its routes.' },
    { from: 'b', to: 'h', label: 'open /deals' },
    { from: 'h', to: 'r', label: 'fetch ./sales', note: 'The page code loads only when somebody needs it.' },
    { from: 'r', to: 'h', label: 'component', ret: true, note: 'Rendered inside the host, sharing one React. A failure here must stay inside your boundary.' },
  ],
}
```

The piece that causes real trouble is `shared`. Both sides agree on a list of libraries that there must be only one copy of: `react`, `react-dom`, `react-router`, `@apollo/client`, `jotai`, `erxes-ui` and a few others.

That isn't an optimization. **Two copies of a library means two sets of module state.** A remote with its own Jotai can't see the host's atoms, and a remote with its own `@apollo/client` has a different context, which is why you'd see "could not find client" in a page that obviously has one. If a plugin works by itself and breaks inside the host, check `shared` before anything else.

## The router, and what you'll see differently

Two more translations, then you're done.

**Apollo Router.** You composed subgraphs in-process with `@apollo/gateway` in Module 17. erxes downloads the real Apollo Router binary (`v1.59.2` at this revision), and the gateway spawns it. On the way, `supergraph-compose.ts` writes out a config and runs `rover supergraph compose`, using the same composition idea with a CLI. So composition errors here come from `rover`, in a terminal, not from your own test.

**Apollo Client 3.** The course taught you version 4, and the frontend runs 3.11. Here are the differences you'll hit in the first hour:

```compare
--- ✘ What you learned (version 4)
import { ApolloClient } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';

if (CombinedGraphQLErrors.is(error)) {
  // error.errors
}
--- ✔ What erxes runs (version 3)
import { ApolloClient, useQuery } from '@apollo/client';

if (error) {
  // error is an ApolloError
  // error.graphQLErrors, error.networkError
}

useQuery(GET_DEAL, {
  onCompleted: (data) => { /* removed from useQuery in 4 */ },
});
```

The ✘ here doesn't mean version 4 is wrong. It means it's wrong *in that repository*, so don't type it there.

## How it fits on one screen

```viz-tree
{
  title: 'One list page and its owners',
  root: {
    id: 'page', label: 'Deals page', color: 'neutral',
    children: [
      { id: 'rows', label: 'Rows', value: 'Apollo', color: 'gql' },
      { id: 'filter', label: 'Search, status, page', value: 'URL, via useQueryState', color: 'forge' },
      { id: 'select', label: 'Selected rows', value: 'Jotai atom', color: 'react' },
      { id: 'count', label: '"3 selected"', value: 'Derived atom. Never stored', color: 'react' },
      { id: 'menu', label: 'Is this menu open?', value: 'useState', color: 'neutral' },
      { id: 'draft', label: 'A half-typed form', value: 'react-hook-form with zod', color: 'neutral' },
    ],
  },
  steps: [
    { focus: ['rows'], caption: 'The truth is on the server.' },
    { focus: ['filter'], caption: 'A link should reproduce this.' },
    { focus: ['select', 'count'], caption: 'Client-only and shared. The count is calculated, so it can\'t be wrong.' },
    { focus: ['menu', 'draft'], caption: 'Small and local. Nothing else needs them.' },
  ],
}
```

```quiz
Q: A reviewer asks why the selected-count badge isn't in its own atom updated by the checkboxes. What's the best answer?
- [ ] Because atoms can't hold numbers
- [x] It's derived from the selected ids, so storing it would create a second truth that can drift
- [ ] Because `useAtom` can't be used in a badge
> A derived atom has no stored value to go stale. Whenever the ids change, the count follows.
```

```quiz
Q: A plugin works when served by itself. Inside the host, `useAtomValue(currentUserState)` gives the default value. What should you check first?
- [ ] The GraphQL schema
- [x] Whether `jotai` is in the `shared` list, so that both builds use one copy
- [ ] The user's permissions
> Two copies of a library mean two module states. The remote's atom and store aren't the host's, even though the code's identical.
```

```quiz
Q: Which belongs in the URL?
- [x] The status filter on a list that people link to each other
- [ ] The currently hovered row
- [ ] The rows returned by the server
> Ask whether a reload or a shared link should keep it. Hover is local and short-lived, and the rows belong to Apollo.
```

Now you'll build a board with all three owners, and the test harness will refresh the page on you.
