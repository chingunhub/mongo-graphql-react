---
title: 'The frontend is another system boundary'
minutes: 26
---

Your API can be perfectly correct and the screen can still be wrong. Reads can come from a stale cache, a response can land after the user has moved on, and a tenant switch can show one organization's data to another.

You built an operations view in Module 21, while the supplied app kept the inbox and network wiring. Now you take those over too. You're comfortable in React already, so this module isn't about components. It's about **data lifetime**: who owns a piece of state, and when it stops being true.

## Three kinds of state

A library booking screen has a half-typed title, a list of books from the server and a selected library. They look alike in React. They've got very different owners.

| State | Examples | Owner |
| --- | --- | --- |
| **Form** | Draft text, touched fields, field errors | The form |
| **Server** | Query results, loading, errors, staleness | Apollo's cache |
| **Session** | Selected identity, and everything tied to it | The session object |

Copying query results into a global store gives you two sources of truth, and now you've got a sync problem that Apollo had already solved. Start with the owner that has the update rules. Add shared state only when several independent consumers really need it. (Many React apps use a small library like Jotai for that shared layer, and Module 24 shows a real example.)

## Identity is more than a header

Here's the bug that this lesson exists for. It's worth running in your head slowly, as it's completely silent.

The user views books in North, then switches to South. You update the auth header on the same Apollo client. The next query says `cache-first`, finds a result, and returns it. **No HTTP request happens.** So your new header is never sent, and the server never gets a chance to refuse.

```ts
// @worked-example reused-client
import { ApolloClient, ApolloLink, gql, InMemoryCache, Observable } from '@apollo/client';

const BOOKS = gql`
  query Books {
    books {
      id
      title
    }
  }
`;

export async function switchTenant() {
  let tenant = 'north';
  let requests = 0;

  const link = new ApolloLink(
    () =>
      new Observable((observer) => {
        requests += 1;
        const title = tenant === 'north' ? 'North atlas' : 'South atlas';
        observer.next({ data: { books: [{ __typename: 'Book', id: '7', title }] } });
        observer.complete();
      }),
  );

  const client = new ApolloClient({ link, cache: new InMemoryCache() });
  await client.query({ query: BOOKS });

  tenant = 'south'; // the "header" changes
  const { data } = await client.query({ query: BOOKS });

  client.stop();
  return { requests, title: (data as any).books[0].title };
}
```

`switchTenant()` resolves to `{ requests: 1, title: 'North atlas' }`. That's South's user reading North's data, with one network call in total.

```viz-sequence
{title:'The request that never happened',actors:[{id:'view',label:'React view',color:'react'},{id:'cache',label:'Apollo cache',color:'react'},{id:'api',label:'HTTP API',color:'gql'}],steps:[
{from:'view',to:'cache',label:'North: books query',note:'An empty cache needs a network request.'},
{from:'cache',to:'api',label:'North credentials',note:'Headers affect this request, and only this one.'},
{from:'api',to:'cache',label:'North result',ret:true,note:'The **root query field** is cached, as well as its entities.'},
{from:'view',to:'cache',label:'South: same query',note:'The same client, the same query, the same cache key.'},
{from:'cache',to:'view',label:'North result!',ret:true,note:'No request means that new headers cannot help. Give a new identity its own cache lifetime.'}
]}
```

Two separate rules come from this, and each fixes a different thing:

| Problem | Fix |
| --- | --- |
| A new identity sees old answers | A new client, with a new cache |
| Two tenants' records collide in one cache | Compound `keyFields`, including the tenant |

```quiz
Q: You added tenant to entity cache keys but reused the same client across logins. Why might a cache-first list still show old data?
- [ ] Entity keys disable network requests
- [x] The root query result may already be cached
- [ ] The server must have returned the wrong tenant
> Compound entity keys prevent record collisions. They do nothing about a cached root query, which needs a new cache lifetime.
```

The bug hunt coming up uses real Apollo execution and a tiny catalogue. Fix it without turning caching off: a blanket `network-only` would "work", and it'd throw away the reason the cache exists.

## One session, three transports

Relaydesk reads a composed graph with GraphQL, accepts external-style intake through REST, and sends a typed triage command through tRPC. That's three protocols with one identity.

So a **session** owns the client and exposes small domain operations. The React component asks to "accept a ticket", and doesn't rebuild headers or parse transport errors each time.

```viz-flow
{
  title: 'One identity, one session, three protocols',
  colWidth: 200,
  rowHeight: 86,
  nodes: [
    { id: 'view', label: 'React views', sub: 'ask for domain actions', col: 0, row: 1, color: 'react' },
    { id: 'session', label: 'Session', sub: 'headers + base URL + client', col: 1, row: 1, color: 'forge' },
    { id: 'gql', label: 'GraphQL', sub: 'HttpLink + cache', col: 2, row: 0, color: 'gql' },
    { id: 'rest', label: 'REST', sub: 'fetch', col: 2, row: 1, color: 'neutral' },
    { id: 'trpc', label: 'tRPC', sub: 'httpBatchLink', col: 2, row: 2, color: 'mongo' },
  ],
  edges: [
    { from: 'view', to: 'session' },
    { from: 'session', to: 'gql' },
    { from: 'session', to: 'rest' },
    { from: 'session', to: 'trpc' },
  ],
  steps: [
    { focus: ['view', 'view>session', 'session'], caption: 'Views never touch headers. When identity changes, the whole session is replaced.' },
    { focus: ['session>gql', 'session>rest', 'session>trpc'], caption: 'The same copied headers go out on all three, so none of them can drift.' },
  ],
}
```

### Three small traps

**Snapshot the headers.** Copy them when you build the session. If you keep a reference to the caller's object, a later change silently alters an in-flight identity.

**Mind the slash.** The app may be served under a path, such as `/projects/relaydesk/reference/`. A leading slash quietly throws that away:

```ts
// @worked-example base-path
const base = 'http://127.0.0.1:4500/projects/relaydesk/reference/';

export const relative = new URL('graphql', base).href;
// http://127.0.0.1:4500/projects/relaydesk/reference/graphql

export const rooted = new URL('/graphql', base).href;
// http://127.0.0.1:4500/graphql
```

The first keeps the path, and the second points somewhere else entirely. It works on your machine at the root, and fails once it's deployed under a prefix.

**`fetch` resolves on a 500.** The promise only rejects when no response arrived. A 403 is a resolved promise with `ok: false`, so check it before you trust the body. Don't turn a failure into an empty list, since that tells an agent "you've got no tickets" during an outage.

```quiz
Q: The inbox's fetch gets a 500. The code does response.json() and returns it. What goes wrong?
- [x] The error body gets treated as a real result
- [ ] fetch throws automatically, so nothing goes wrong
- [ ] The browser retries the request
> fetch rejects only when no response arrived. An HTTP failure is a successful fetch of a bad answer, so check response.ok.
```

## Disposal is a contract

A stopped session must refuse new operations **before** sending a request. Stop the Apollo client exactly once.

Stopping doesn't cancel requests that are already flying, though. Those will land later, and the view has to refuse them. The next lesson makes that visible.

And the types: `TriageRouter` is a type-only import, so it describes tRPC calls and ships no backend code. Generated `TicketsQuery` describes one selected operation, not a whole document. After changing `web/operations.ts`, regenerate and read the output.

## What's next

Fix the bug hunt first. Then, in the forge step, build the session factory while the supplied UI stays usable, and trace each action in **Map → Follow a request** to the file responsible.
