---
title: "Taskforge web: the client and the issue list"
kind: forge
workspace: taskforge
env: dom
summary: Your Apollo Client factory with auth, and the first real Taskforge screen — a filterable issue list.
focus: [web/apollo.ts, web/components/IssueList.tsx, web/preview.tsx]
readonly: [web/preview.tsx, web/dev/demoSession.ts]
preview: web/preview.tsx
---

Taskforge gets a face. Everything you built in Parts I and II is now behind one endpoint, and the `web/` folder starts here. **Run preview** renders your components against the live reference API, logged in as Ada (see `web/preview.tsx`).

```viz-flow
{
  colWidth: 175,
  rowHeight: 70,
  nodes: [
    { id: 'list', label: '<IssueList>', sub: 'web/components', col: 0, row: 0, color: 'forge' },
    { id: 'client', label: 'apollo.ts', sub: 'auth link → http', col: 1, row: 0, color: 'forge' },
    { id: 'api', label: 'GraphQL API', sub: 'Parts I + II', col: 2, row: 0, color: 'gql' },
  ],
  edges: [
    { from: 'list', to: 'client', label: 'ProjectIssues' },
    { from: 'client', to: 'api', label: 'Bearer token' },
  ],
}
```

## Your task

### 1. `web/apollo.ts`
- `createCache()` → an `InMemoryCache` (it gets configuration in module 12 — that's why it's its own function).
- `createApolloClient({ uri, getToken, fetch })` → an `ApolloClient` whose requests carry `authorization: Bearer <token>` **whenever `getToken()` returns a token** — read at request time, not creation time — and no `authorization` header otherwise. Pass `fetch` through to the `HttpLink` (the tests use it to inspect your requests). Use `createCache()` for the cache.

### 2. `web/components/IssueList.tsx` — `IssueList({ projectKey })`
Export the query as `PROJECT_ISSUES`, an operation named **`ProjectIssues`** with variables `$key` and `$status`.

- A `<select>` labelled **`Status filter`** using the provided `STATUS_OPTIONS` (value = enum, text = label). It's always visible, even while results load.
- Initially and whenever results load: `Loading issues…`.
- Errors: `role="alert"` with `Couldn't load issues: <message>`.
- Unknown project: `Project not found.`
- Otherwise: an `<h2>` with the project name, then either `No issues match.` or a list labelled **`Issues`** (`<ul aria-label="Issues">`) with one `<li>` per issue showing its **key, title, priority**, and the **assignee's name or `Unassigned`**.
- Choosing a status re-queries with `status` set to it; "All statuses" sends `status: null`.

Include `id` in every object you select — next module will explain why that's not optional.

## Hints

### The filter variable
`issues(filter: { status: $status })` with `$status: IssueStatus` (nullable). Pass `status: status || null` — an empty-string status would fail enum validation.

### The auth link
`new SetContextLink((prevContext) => ({ headers: { ...prevContext.headers, ...(token ? { authorization: \`Bearer ${token}\` } : {}) } }))` with `const token = getToken()` **inside** the setter. Then `auth.concat(new HttpLink({ uri, fetch }))`.

### Keeping the filter visible
Render the `<select>` first, then decide what goes underneath (loading / error / not found / list). An early `return <p>Loading…</p>` before the select would unmount it on every filter change.
