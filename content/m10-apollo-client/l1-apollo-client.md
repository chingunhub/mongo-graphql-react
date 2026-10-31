---
title: "Apollo Client: the mental model"
minutes: 18
---

> [!NOTE]
> This is Stage 2, where you write real React: hooks, the Apollo cache and forms. It asks for more than a React introduction, so expect to look things up. If you finished Stage 1, you have already reached the main goal, so take this when you have the time.

You've spent two parts on the server. Now we cross to the other end of the HTTP request. You already know React; the new thing is that **data fetching stops being something your components do** and becomes something they **declare**. Apollo Client does the fetching, caching and re-rendering.

## Two parts: links and a cache

```viz-flow
{
  colWidth: 175,
  rowHeight: 76,
  nodes: [
    { id: 'c', label: 'Components', sub: 'useQuery / useMutation', col: 0, row: 0.5, color: 'react' },
    { id: 'cache', label: 'InMemoryCache', sub: 'normalized store', col: 1, row: 0, color: 'react' },
    { id: 'links', label: 'Link chain', sub: 'auth → http', col: 1, row: 1, color: 'react' },
    { id: 's', label: 'GraphQL server', sub: 'POST /graphql', col: 2, row: 1, color: 'gql' },
  ],
  edges: [
    { from: 'c', to: 'cache', label: 'read / watch' },
    { from: 'c', to: 'links', label: 'on a miss' },
    { from: 'links', to: 's' },
    { from: 's', to: 'cache', label: 'results written', dashed: true },
  ],
  steps: [
    { focus: ['c'], caption: 'Components describe the data they need with GraphQL documents. They never call `fetch`.' },
    { focus: ['c>cache', 'cache'], caption: 'The **cache** is checked first. It\'s not a dumb "query → response" map — it stores every object by type and id (next module).' },
    { focus: ['c>links', 'links', 'links>s', 's'], caption: 'On a miss, the operation goes down the **link chain** — a pipeline of small middlewares. Typically: add an auth header, then send over HTTP.' },
    { focus: ['s>cache', 'cache', 'c>cache'], caption: 'Results are **written into the cache**, and every component watching that data re-renders. Components read from the cache, not from the response.' },
  ],
}
```

## Setting it up

```ts title="web/apollo.ts"
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';

export function createApolloClient({ uri, getToken }: { uri: string; getToken: () => string | null }) {
  const auth = new SetContextLink((prevContext) => {
    const token = getToken(); // read at request time, not when the client is created
    return {
      headers: { ...prevContext.headers, ...(token && { authorization: `Bearer ${token}` }) },
    };
  });
  return new ApolloClient({
    link: auth.concat(new HttpLink({ uri })),
    cache: new InMemoryCache(),
  });
}
```

```tsx title="web/main.tsx"
import { ApolloProvider } from '@apollo/client/react';

const client = createApolloClient({ uri: '/graphql', getToken: () => session.token });
root.render(
  <ApolloProvider client={client}>
    <App />
  </ApolloProvider>,
);
```

Three details that matter:

- **`getToken` is a function**, called for each request. Pass the token *value* instead and the client keeps sending the token from when it was created — logging in later won't work until a page reload.
- **Create the client once** (module level, or `useMemo`/`useState` initializer). A new client per render means a new, empty cache per render.
- **Links compose.** `auth.concat(http)` runs auth first. Real apps add error logging, retries, etc. as more links — the same middleware idea as on the server.

> [!WARNING] Apollo Client 4 moved things
> In v4, React hooks and `ApolloProvider` come from **`@apollo/client/react`**, not `@apollo/client`. Core things (`ApolloClient`, `InMemoryCache`, `HttpLink`, `gql`) still come from `@apollo/client`. Most tutorials online are v3 and import everything from `@apollo/client` — you'll see that in older codebases, and you'll need to know which version you're in.

## useQuery

```tsx
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

const BOOKS = gql`
  query Books($tag: String) {
    books(tag: $tag) { id title year }
  }
`;

function BookList({ tag }: { tag?: string }) {
  const { data, loading, error } = useQuery(BOOKS, { variables: { tag } });

  if (loading && !data) return <p>Loading books…</p>;
  if (error) return <p role="alert">Couldn't load books: {error.message}</p>;
  if (!data.books.length) return <p>No books yet.</p>;
  return <ul>{data.books.map((b) => <li key={b.id}>{b.title} ({b.year})</li>)}</ul>;
}
```

Every component that queries has the same four states — **loading, error, empty, data** — and a good UI handles all four. Here's the lifecycle across two components that need the same data:

```viz-sequence
{
  actors: [
    { id: 'a', label: '<BookList>', color: 'react' },
    { id: 'b', label: '<BookCount>', color: 'react' },
    { id: 'cache', label: 'cache', color: 'react' },
    { id: 's', label: 'server', color: 'gql' },
  ],
  steps: [
    { from: 'a', to: 'cache', label: 'useQuery(BOOKS)', note: 'First render: the cache has nothing. `loading: true`, `data: undefined`.' },
    { from: 'cache', to: 's', label: 'Books { … }', note: 'A network request goes out.' },
    { from: 's', to: 'cache', label: 'data', ret: true, note: 'Result normalized and stored.' },
    { from: 'cache', to: 'a', label: 'data → re-render', ret: true, note: '`loading: false`, `data` arrives.' },
    { from: 'b', to: 'cache', label: 'useQuery(BOOKS)', note: 'Another component mounts later and asks for the same data…' },
    { from: 'cache', to: 'b', label: 'data (no network)', ret: true, note: '…and gets it **straight from the cache**, synchronously. This is the default fetch policy, `cache-first`.' },
  ],
}
```

### Variables change → new request

When `variables` change between renders (`tag` goes from `undefined` to `"scifi"`), useQuery re-runs automatically with the new variables — cached results for those variables are reused if present. You don't write effects for this. If you find yourself writing `useEffect(() => refetch(), [tag])`, delete it.

### Options you'll reach for

| Option | Does |
| --- | --- |
| `variables` | the operation's variables |
| `skip: true` | don't run yet (e.g. until the user picks something) |
| `fetchPolicy` | `cache-first` (default) · `cache-and-network` (show cache, refresh in background) · `network-only` · `no-cache` |
| `pollInterval` | refetch every N ms |

And from the result: `refetch()`, `networkStatus`, and `previousData` (the last data before variables changed — handy to avoid flashing a spinner when switching filters).

> [!NOTE] `loading` during refetches
> In Apollo Client 4, `loading` is also `true` while an already-loaded query **refetches** (`notifyOnNetworkStatusChange` now defaults to `true`). So `if (loading) return <Spinner />` throws away perfectly good data — and unmounts everything below it — on every refresh. Prefer `if (loading && !data)`: spinner only when there's nothing to show yet.

## Errors

`error` is set when the operation failed. In Apollo Client 4 it's one of a few classes; the one you'll check most is GraphQL errors from the server:

```ts
import { CombinedGraphQLErrors } from '@apollo/client/errors';

if (CombinedGraphQLErrors.is(error)) {
  const code = error.errors[0]?.extensions?.code; // 'UNAUTHENTICATED', 'NOT_FOUND', …
  if (code === 'UNAUTHENTICATED') return <LoginPrompt />;
}
```

This is where all the work you did on error codes in Module 8 pays off: the client branches on `extensions.code`, never on message text. (Older v3 code uses `error.graphQLErrors` — the property is `errors` in v4.)

By default (`errorPolicy: 'none'`), if the response has *any* errors, `data` is `undefined` and `error` is set — even if part of the data came back. `errorPolicy: 'all'` gives you both partial `data` and `error`, for pages that can render around a failed field.

## Where the query lives

Put the `gql` document **next to the component that uses it**, at module level (so it's parsed once):

```tsx title="components/IssueList.tsx"
export const PROJECT_ISSUES = gql`
  query ProjectIssues($key: String!) { … }
`;
export function IssueList(…) { … }
```

When someone asks "what data does the issue list need?", the answer is right there, in the same file as the JSX that uses it. Module 12 takes this further with fragments.

Try the board query the next task will use, against the live API:

```graphql-try
query ProjectIssues($key: String!, $status: IssueStatus) {
  project(key: $key) {
    id
    name
    issues(filter: { status: $status }) {
      id
      key
      title
      status
      priority
      assignee { id name }
    }
  }
}
---variables---
{ "key": "TF", "status": "IN_REVIEW" }
```

Notice every object selection includes `id` — that's not decoration, it's what lets the cache recognize objects. Next module explains why it matters so much.

```quiz
Q: A login form stores the token in React state after the client was created. Requests still go out without a token. What's the likely cause?
- [x] The auth link captured the token value at creation time instead of calling `getToken()` per request
- [ ] Apollo Client doesn't support auth headers
- [ ] The cache is still empty
> Links run per request — read the token *inside* the context setter, from wherever it's kept now.
```

```quiz
Q: Two components on the page run the same query with the same variables. How many network requests (default fetch policy)?
- [ ] Two
- [x] One — the second is answered from the cache
- [ ] Zero
> `cache-first` answers from the cache whenever everything the query needs is already there.
```
