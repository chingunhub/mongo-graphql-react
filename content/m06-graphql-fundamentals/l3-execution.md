---
title: How a query is executed
minutes: 16
---

This is the lesson that makes GraphQL servers stop feeling like magic. Once you can picture execution, you can predict performance problems, understand error responses, and know exactly which function to open when a field comes back wrong.

## Three phases

```viz-flow
{
  colWidth: 175,
  rowHeight: 86,
  nodes: [
    { id: 'text', label: 'query text', sub: 'a string', col: 0, row: 0, color: 'neutral' },
    { id: 'parse', label: 'parse', sub: '→ AST', col: 1, row: 0, color: 'gql' },
    { id: 'validate', label: 'validate', sub: 'against schema', col: 2, row: 0, color: 'gql' },
    { id: 'exec', label: 'execute', sub: 'call resolvers', col: 3, row: 0, color: 'gql' },
    { id: 'syntax', label: 'syntax error', sub: 'no data', col: 1, row: 1, color: 'bad' },
    { id: 'invalid', label: 'validation error', sub: 'no data', col: 2, row: 1, color: 'bad' },
    { id: 'result', label: '{ data, errors? }', col: 3, row: 1, color: 'ok' },
  ],
  edges: [
    { from: 'text', to: 'parse' },
    { from: 'parse', to: 'validate' },
    { from: 'validate', to: 'exec' },
    { from: 'parse', to: 'syntax', dashed: true },
    { from: 'validate', to: 'invalid', dashed: true },
    { from: 'exec', to: 'result' },
  ],
  steps: [
    { focus: ['text', 'text>parse', 'parse'], caption: '**Parse** turns the text into an abstract syntax tree. A missing brace fails here.' },
    { focus: ['parse>syntax', 'syntax'], caption: 'Syntax errors return immediately: `errors` only, no `data`. None of your code runs.' },
    { focus: ['parse>validate', 'validate'], caption: '**Validate** checks the AST against the schema: do these fields exist on these types? Are arguments and variables the right types? Is that enum value real?' },
    { focus: ['validate>invalid', 'invalid'], caption: 'Validation errors also return before execution. This is why typos in queries are caught instantly and safely.' },
    { focus: ['validate>exec', 'exec', 'exec>result', 'result'], caption: '**Execute** walks the query tree and calls a **resolver** for every field. Only this phase runs your code — and only this phase can produce partial data.' },
  ],
}
```

## Resolvers: one function per field

A resolver is a function that produces the value of **one field**. Every field in the schema has one — you write some; GraphQL supplies a default for the rest.

```ts
const resolvers = {
  Query: {
    project: (parent, args, context) => Project.findOne({ key: args.key }).exec(),
  },
  Project: {
    issues: (project, args) => Issue.find({ project: project._id }).limit(args.limit).exec(),
  },
  Issue: {
    assignee: (issue) => (issue.assignee ? User.findById(issue.assignee).exec() : null),
  },
};
```

Resolvers get four arguments: `(parent, args, context, info)` — the value of the **parent** field, this field's **arguments**, a per-request **context** object, and `info` (the AST and path; rarely needed). Module 7 covers each in depth.

### Execution is a tree walk

Here's the query from lesson 1. Step through it and watch which resolver runs when, and what flows into each one as `parent`:

```viz-tree
{
  title: 'query { project(key: "TF") { name issues(limit: 2) { title assignee { name } } } }',
  root: {
    id: 'q', label: 'Query', color: 'neutral',
    children: [
      { id: 'p', label: 'project(key: "TF")', children: [
        { id: 'pn', label: 'name' },
        { id: 'pi', label: 'issues(limit: 2)', children: [
          { id: 'i0', label: '[0]', color: 'neutral', children: [
            { id: 'i0t', label: 'title' },
            { id: 'i0a', label: 'assignee', children: [ { id: 'i0an', label: 'name' } ] },
          ]},
          { id: 'i1', label: '[1]', color: 'neutral', children: [
            { id: 'i1t', label: 'title' },
            { id: 'i1a', label: 'assignee', children: [ { id: 'i1an', label: 'name' } ] },
          ]},
        ]},
      ]},
    ],
  },
  steps: [
    { focus: ['q'], caption: 'Execution starts at the root type. The root `parent` is usually just `undefined` (or a `rootValue` you configured).' },
    { focus: ['p'], caption: '`Query.project` runs with `args = { key: "TF" }`. It returns a Project document — and **that object becomes the `parent` for every field selected under it**.', reveal: { p: 'Project{ _id, name, … }' } },
    { focus: ['pn', 'pi'], caption: 'Sibling fields resolve **concurrently**. `name` has no custom resolver, so the **default resolver** returns `parent.name`. `issues` is custom: it queries MongoDB.', reveal: { pn: '"Taskforge"', pi: '[Issue, Issue]' } },
    { focus: ['i0', 'i1'], caption: 'A list field: execution continues **for each item**, with that item as `parent`.' },
    { focus: ['i0t', 'i1t', 'i0a', 'i1a'], caption: '`title` is a default resolver again. `assignee` is custom — and runs **once per issue**. Every assigned issue → one `User.findById` call. A hundred assigned issues → a hundred. Remember this shape; it\'s the N+1 problem from Module 4, and Module 9 fixes it.', reveal: { i0t: '"Keyboard shortcuts"', i1t: '"Export to CSV"', i0a: 'User{ name: "Grace…" }', i1a: 'null' } },
    { focus: ['i0an', 'i1an'], caption: 'Below a `null`, nothing runs: `issue[1].assignee` is null, so its `name` is never resolved. The response just has `"assignee": null`.', reveal: { i0an: '"Grace Hopper"' } },
  ],
}
```

### The default resolver

When you don't write a resolver for a field, GraphQL uses this (simplified):

```ts
function defaultResolver(parent, args, context, info) {
  const value = parent[info.fieldName];
  return typeof value === 'function' ? value.call(parent, args, context, info) : value;
}
```

That's why most fields just work: return a Mongoose document from `Query.project`, and `name`, `key`, `description` all resolve from its properties. You only write resolvers for fields that need **work**: a query, a computation, a rename, or a permission check.

It's also why *some* fields mysteriously come back `null`: the property name on the object doesn't match the field name (`_id` vs `id`, `assignee` holding an ObjectId instead of a user…). When a field is wrong, the first question is **"what object is the parent here, and what properties does it actually have?"**

### Order guarantees

- **Query** fields at the same level may resolve in parallel. Don't rely on order.
- **Mutation** root fields run **one after another**, in the order written. `mutation { a: createIssue(…) b: createIssue(…) }` creates `a` first. (Fields *inside* a mutation's result resolve like a query.)

## Errors and null propagation

When a resolver throws, GraphQL doesn't fail the whole request. It records the error (with the **path** to the field) and puts `null` where the value would have been:

```json
{
  "data": { "project": { "name": "Taskforge", "stats": null } },
  "errors": [{ "message": "Stats service timed out", "path": ["project", "stats"] }]
}
```

The rest of the page can still render. But here's the catch — **what if the field was non-null?** It can't be `null`. So the null **bubbles up** to the nearest parent that *is* nullable:

```viz-tree
{
  title: 'Issue.reporter is User! — and its resolver throws',
  root: {
    id: 'q', label: 'Query', color: 'neutral',
    children: [
      { id: 'p', label: 'project: Project   (nullable)', children: [
        { id: 'pn', label: 'name: String!' },
        { id: 'pi', label: 'issues: [Issue!]!', children: [
          { id: 'i0', label: '[0]: Issue!', color: 'neutral', children: [
            { id: 'i0t', label: 'title: String!' },
            { id: 'i0r', label: 'reporter: User!' },
          ]},
        ]},
      ]},
    ],
  },
  steps: [
    { focus: ['i0r'], caption: '`reporter` throws. It\'s `User!` — non-null — so it **can\'t** become null itself.', reveal: { i0r: '!throws', i0t: '"Login page"', pn: '"Taskforge"' } },
    { focus: ['i0'], caption: 'The null moves up to the parent: issue `[0]`. But list items are `Issue!` — non-null too.', reveal: { i0: '!null' } },
    { focus: ['pi'], caption: 'Up again: `issues` is `[Issue!]!`, also non-null.', reveal: { pi: '!null' } },
    { focus: ['p'], caption: '`project` is nullable, so the bubbling stops here. **The whole project is `null`** — its name, every issue — because one reporter lookup failed. That\'s the price of an over-eager `!`.', reveal: { p: '!null' } },
  ],
}
```

This is the real reason nullability is a design decision. Non-null fields are great for clients (no null checks), but every `!` widens the **blast radius** of a failure. If `data` itself would become null, the response has `"data": null` and only errors.

```quiz
Q: A resolver for `Query.book` returns a Mongoose document. The query selects `title` and `year`, and there are no `Book.title` / `Book.year` resolvers. Where do those values come from?
- [ ] GraphQL loads the book again for each field
- [x] The default resolver reads `parent.title` and `parent.year` from the document
- [ ] They come back null without explicit resolvers
> The default resolver returns `parent[fieldName]`. Most fields need no resolver at all.
```

```quiz
Q: `Query.project` is nullable. Deep inside it, a non-null field's resolver throws, and every field between them is non-null. What does the client get for `project`?
- [ ] The project with that one field missing
- [x] `null`, plus an entry in `errors` with the path to the failing field
- [ ] An HTTP 500
> The null propagates upward through non-null fields until it reaches a nullable one. Partial data is still returned elsewhere in the response.
```
