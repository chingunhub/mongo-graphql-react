---
title: What GraphQL actually is
minutes: 16
---

You have a data layer now. Part II puts an API in front of it. Before any server code, let's get clear on what GraphQL *is*, because it's often explained as "a better REST", which is half right and leads to some odd designs.

GraphQL is three things:

1. **A query language** clients use to ask for data — exactly the fields they need, in the shape they need.
2. **A type system** the server uses to describe everything it can provide: the **schema**.
3. **An execution model**: how a server takes a query and a schema and produces a result by calling small functions called **resolvers**.

This lesson is about (1). The next two cover (2) and (3).

> [!BRIDGE]
> In a REST API, each URL is one thing you can ask for: `GET /projects/TF`, then `GET /projects/TF/issues?limit=2`, then one more call for each assignee. GraphQL usually has one URL, `POST /graphql`, and the request body says what you want. The routes didn't vanish. The list of what's possible moved from your router into the schema.

## The shape of the request is the shape of the response

Here's a query against the live reference Taskforge API, and what comes back:

```compare
--- query (graphql)
query {
  project(key: "TF") {
    name
    issues(limit: 2) {
      key
      title
      assignee {
        name
      }
    }
  }
}
--- response (json)
{
  "data": {
    "project": {
      "name": "Taskforge",
      "issues": [
        { "key": "TF-24", "title": "Keyboard shortcuts",
          "assignee": { "name": "Grace Hopper" } },
        { "key": "TF-23", "title": "Export to CSV",
          "assignee": null }
      ]
    }
  }
}
```

Read them side by side. Every field you wrote appears in the response, nested the same way, and nothing else does. That mirror property is the whole user experience of GraphQL: **the client describes a tree; the server fills it in.**

Try it — it's a real server. Add `status` under `title`, or remove `assignee`, and run again:

```graphql-try
query {
  project(key: "TF") {
    name
    issues(limit: 2) {
      key
      title
      assignee {
        name
      }
    }
  }
}
```

## Why not just REST?

Picture the Taskforge board page with a REST API. It needs the project, its issues, and each issue's assignee:

```viz-sequence
{
  title: 'REST: the board page',
  actors: [
    { id: 'ui', label: 'Board page', color: 'react' },
    { id: 'api', label: 'REST API', color: 'neutral' },
  ],
  steps: [
    { from: 'ui', to: 'api', label: 'GET /projects/TF', note: 'Returns the whole project object — description, settings, owner details… the board needs only the name. **Over-fetching.**' },
    { from: 'api', to: 'ui', label: '200 { …40 fields }', ret: true },
    { from: 'ui', to: 'api', label: 'GET /projects/TF/issues', note: 'A second round trip, because the first response didn\'t include issues. **Under-fetching.**' },
    { from: 'api', to: 'ui', label: '200 [ …24 issues ]', ret: true, note: 'Issues contain `assigneeId`, not the assignee\'s name…' },
    { from: 'ui', to: 'api', label: 'GET /users?ids=…', note: '…so a third request. Or someone adds `?include=assignee` to the endpoint, then `?include=assignee,labels`, and the endpoint slowly turns into a query language nobody designed.' },
    { from: 'api', to: 'ui', label: '200 [ …users ]', ret: true },
  ],
}
```

```viz-sequence
{
  title: 'GraphQL: the board page',
  actors: [
    { id: 'ui', label: 'Board page', color: 'react' },
    { id: 'api', label: 'GraphQL API', color: 'gql' },
  ],
  steps: [
    { from: 'ui', to: 'api', label: 'POST /graphql { project { name issues { … assignee { name } } } }', note: 'One request describing the whole tree the page needs.' },
    { from: 'api', to: 'ui', label: '200 { data: { project: … } }', ret: true, note: 'One response with exactly that tree. When the page changes, the *query* changes — no new endpoint, no backend deploy.' },
  ],
}
```

The honest trade-offs, since you'll hear opinions both ways:

| | REST | GraphQL |
| --- | --- | --- |
| Fetching what a screen needs | several endpoints or custom ones | one query, client decides |
| HTTP caching (CDNs, browser) | natural (GET + URLs) | harder (mostly POST); clients cache instead |
| Typed contract | optional (OpenAPI) | built in, introspectable |
| Server complexity | simpler per endpoint | resolvers, N+1 risks, query cost limits |
| Errors | HTTP status codes | mostly `200` with an `errors` array |

GraphQL shines when many different screens (or many different clients) need different slices of the same connected data. That's exactly the kind of app that grows into a big codebase.

## Anatomy of a request

Under the hood it's boring HTTP. Every operation is a `POST` to one endpoint with a JSON body:

```json title="POST /graphql"
{
  "query": "query ProjectBoard($key: String!) { project(key: $key) { name } }",
  "variables": { "key": "TF" },
  "operationName": "ProjectBoard"
}
```

And the response is JSON with up to two top-level keys:

```json
{
  "data": { "project": { "name": "Taskforge" } },
  "errors": [ /* only if something went wrong */ ]
}
```

Yes, `data` and `errors` can **both** be present: GraphQL can return partial results. Module 8 is about doing that well.

## Operations: query, mutation, subscription

```graphql
query ProjectBoard { ... }      # read
mutation CreateIssue { ... }    # write
subscription IssueUpdated { ... } # server pushes over a socket (not covered here)
```

The keyword `query` and the name are optional for a quick read (`{ projects { name } }` works), but **always name your operations** in real code. The name shows up in server logs, in Apollo's dev tools, and in error reports — `ProjectBoard failed` is debuggable; `anonymous query failed` is not.

## Variables: never build query strings

You *could* write `project(key: "TF")` by concatenating user input into the query string. Don't — same reason you don't build SQL by concatenation. Declare **variables** with types, pass values separately:

```graphql-try
query ProjectBoard($key: String!, $limit: Int = 3) {
  project(key: $key) {
    name
    issues(limit: $limit) {
      key
      title
    }
  }
}
---variables---
{ "key": "TF", "limit": 2 }
```

`$key: String!` declares a required string variable; `$limit: Int = 3` has a default. The server validates variable values against those types *before* running anything. Try setting `"limit": "two"` and see what comes back.

## Aliases and fragments

**Aliases** rename a field in the response — and let you ask for the same field twice with different arguments:

```graphql-try
query {
  todo: project(key: "TF") {
    issueCount(filter: { status: TODO })
  }
  done: project(key: "TF") {
    issueCount(filter: { status: DONE })
  }
}
```

**Fragments** are reusable selections, named and attached to a type:

```graphql
fragment IssueSummary on Issue {
  key
  title
  status
  assignee { name }
}

query {
  project(key: "TF") {
    issues(limit: 5) { ...IssueSummary }
  }
}
```

On the server side a fragment is just copy-paste. On the client side it's an architecture tool: each React component declares the fragment of data *it* needs, and pages compose them. That's Module 12.

## The schema describes itself

Every GraphQL server can answer questions about its own schema — **introspection**. This is how tools like Apollo Sandbox autocomplete your queries:

```graphql-try
query {
  __type(name: "Issue") {
    fields {
      name
      type { name kind ofType { name } }
    }
  }
}
```

And any object can tell you its type name with `__typename`, which will matter a lot for Apollo Client's cache:

```graphql-try
query {
  projects { __typename key }
}
```

```quiz
Q: A client sends `{ project(key: "TF") { name } }`. What does the response's `data` contain?
- [ ] The full project document as stored in MongoDB
- [x] `{ "project": { "name": "…" } }` — only what was asked for
- [ ] The project plus its default fields like `id`
> The response mirrors the selection exactly. No field appears unless the query asked for it — not even `id`.
```

```quiz
Q: Why should production code use variables instead of putting values into the query string?
- [ ] Variables are faster to parse
- [x] Values stay data (typed, validated, injection-safe), and the query text stays constant and cacheable
- [ ] The server rejects literal arguments
> Literal arguments are legal GraphQL — but building query strings from user input invites injection-style bugs, and a constant query text lets servers and clients cache the parsed document.
```
