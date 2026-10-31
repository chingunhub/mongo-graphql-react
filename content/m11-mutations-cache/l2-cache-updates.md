---
title: "Mutations: refetch, update the cache, or be optimistic"
minutes: 18
---

## useMutation

```tsx
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';

const ADD_BOOK = gql`
  mutation AddBook($input: AddBookInput!) {
    addBook(input: $input) { id title year }
  }
`;

function AddBookForm() {
  const [addBook, { loading, error }] = useMutation(ADD_BOOK);
  const [title, setTitle] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addBook({ variables: { input: { title, year: 2026 } } });
      setTitle('');
    } catch {
      // error is also available as `error` from the hook — render it below
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>Title <input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <button disabled={loading}>{loading ? 'Adding…' : 'Add book'}</button>
      {error && <p role="alert">Couldn't add the book: {error.message}</p>}
    </form>
  );
}
```

Unlike `useQuery`, a mutation doesn't run on render — the hook gives you a function to call. Calling it returns a promise that **rejects** on error (catch it, or an unhandled rejection warning follows), *and* the hook's `error` is set for rendering.

Now the real question: the book was added on the server. How does the list on the page find out?

## Option 1: refetch

```ts
useMutation(ADD_BOOK, { refetchQueries: ['Books'] });          // by operation name
useMutation(ADD_BOOK, { refetchQueries: [{ query: BOOKS, variables: { tag: 'scifi' } }] });
```

After the mutation, Apollo re-runs the named **active** queries (the ones currently rendered). It's one line, always correct (the server computes the list), and works with any filters, sorts and pagination. Cost: an extra round trip, and a moment where the list is stale.

> [!WARNING]
> `refetchQueries: ['Books']` matches the **operation name** — the `Books` in `query Books(…)`. A typo, or an anonymous `query { … }`, silently refetches nothing. No error, no warning. Name your operations (Module 6!) and copy names, don't retype them.

## Option 2: update the cache yourself

When you know exactly how the list should change, write it directly — no round trip:

```ts
useMutation(ADD_BOOK, {
  update(cache, { data }) {
    const newBook = data?.addBook;
    if (!newBook) return;
    cache.updateQuery({ query: BOOKS, variables: { tag: undefined } }, (existing) =>
      existing ? { books: [newBook, ...existing.books] } : existing,
    );
  },
});
```

`cache.updateQuery` reads a query from the cache, lets you return a new version, and writes it back. It's a good fit when one specific query (with known variables) shows the list.

For changing **a field on a specific entity** — say, appending to `Author:a7.books` and bumping a count — `cache.modify` works at the entity level, without needing the query document:

```ts
update(cache, { data }) {
  cache.modify({
    id: cache.identify({ __typename: 'Author', id: authorId }), // 'Author:a7'
    fields: {
      books(existingRefs = [], { toReference }) {
        return [...existingRefs, toReference(data.addBook)]; // lists hold references
      },
      bookCount(n = 0) {
        return n + 1;
      },
    },
  });
},
```

Each function under `fields` receives that field's **current cached value** and returns the new one. Lists of entities contain *references*, so you add `toReference(newObject)` (or the ref you got from `cache.writeFragment`). If the field isn't in the cache yet (nobody queried it), the modifier simply doesn't run — which is fine: there's nothing stale.

**Trade-off:** manual updates are instant and cheap, but they duplicate server logic in the client. If the server sorts, filters, or computes counts in ways your code doesn't mirror exactly, the cache drifts from reality. Rule of thumb: update manually for simple, well-understood lists (append a comment to a thread); refetch for anything with filters, sorting or pagination.

## Option 3: optimistic UI

For actions that almost never fail — toggling a status, liking a post — make the UI respond **before** the server does:

```ts
const [setStatus] = useMutation(SET_STATUS);

setStatus({
  variables: { id: issue.id, status: 'DONE' },
  optimisticResponse: {
    updateIssue: { __typename: 'Issue', id: issue.id, status: 'DONE' },
  },
});
```

```viz-sequence
{
  actors: [
    { id: 'ui', label: '<StatusSelect>', color: 'react' },
    { id: 'cache', label: 'cache', color: 'react' },
    { id: 's', label: 'server', color: 'gql' },
  ],
  steps: [
    { from: 'ui', to: 'cache', label: 'optimisticResponse', note: 'Apollo writes your **guessed** result into an optimistic layer of the cache immediately. `Issue:i1.status` is now DONE — the UI updates in the same frame as the click.' },
    { from: 'cache', to: 's', label: 'mutation', note: 'Meanwhile the real request goes out.' },
    { from: 's', to: 'cache', label: 'real result', ret: true, note: '**Success:** the optimistic layer is thrown away and the real result is written. Usually identical, so nothing visibly changes.' },
    { from: 's', to: 'cache', label: 'error', ret: true, note: '**Failure:** the optimistic layer is thrown away and the cache **rolls back** to the old status automatically. Show an error so the user knows why it snapped back.' },
  ],
}
```

The word that matters in that sequence is *layer*. Your guess never overwrites the stored data, which is why a rollback needs no undo code from you. Break it on purpose and watch the three boxes:

```viz optimistic-lab
{}
```

The optimistic response must look exactly like the real one: same shape, `__typename`, and `id` — it goes through normalization like real data.

## Combining them

Real features often mix: an optimistic status change (instant feedback on the entity) **plus** `refetchQueries` for the filtered lists that the issue should now leave or join. The entity updates instantly; list membership catches up a moment later, computed by the server.

```ts
setStatus({
  variables: { id, status },
  optimisticResponse: { updateIssue: { __typename: 'Issue', id, status } },
  refetchQueries: ['ProjectIssues'],
});
```

## Choosing

```viz-flow
{
  colWidth: 200,
  rowHeight: 80,
  nodes: [
    { id: 'q', label: 'Mutation changes…', col: 0, row: 1, color: 'neutral' },
    { id: 'e', label: 'fields of an entity', sub: 'return it with id', col: 1, row: 0, color: 'ok' },
    { id: 's', label: 'a simple list', sub: 'cache.modify / updateQuery', col: 1, row: 1, color: 'react' },
    { id: 'c', label: 'filtered/sorted/paged lists', sub: 'refetchQueries', col: 1, row: 2, color: 'react', w: 180 },
    { id: 'o', label: 'feels slow?', sub: '+ optimisticResponse', col: 2, row: 1, color: 'forge' },
  ],
  edges: [
    { from: 'q', to: 'e' }, { from: 'q', to: 's' }, { from: 'q', to: 'c' },
    { from: 'e', to: 'o', dashed: true }, { from: 's', to: 'o', dashed: true },
  ],
}
```

```quiz
Q: `refetchQueries: ['ProjectIssue']` runs after a create, but the list doesn't update. The list's query is `query ProjectIssues(...)`. What happened?
- [x] The name doesn't match any active query, so nothing was refetched — silently
- [ ] refetchQueries only works with DocumentNodes
- [ ] The create failed
> Names must match exactly. This is why copying operation names (or passing the document itself) beats retyping them.
```

```quiz
Q: An optimistic status change succeeds visually, then the server returns an error. What does the user see?
- [ ] The new status, permanently
- [x] The status snaps back to the old value (and whatever error UI you render)
- [ ] A blank list
> The optimistic layer is discarded on error, restoring the previous cache state. Render the error so the snap-back makes sense.
```
