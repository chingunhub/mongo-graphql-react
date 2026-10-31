---
title: "Composition checks promises; execution checks behavior"
minutes: 22
---

Two teams each ship a schema that's valid on its own. Put them together, and they disagree. Catching that **before a user sends a query** is the job of composition.

The opposite failure matters just as much. A successful composition feels like a green test, so people treat it like one. It isn't. By the end of this lesson you should be able to say what it proves and what it doesn't.

## Three schemas with one name

"The schema" is ambiguous in a federated system, and half of the confusion in a Slack thread comes from that.

| Schema | Who writes it | What's in it |
| --- | --- | --- |
| **Subgraph schema** | each service's owners | that service's fields, `@key` and friends |
| **Supergraph schema** | composition generates it | all fields, plus routing metadata |
| **API schema** | derived automatically | what clients see, with the machinery removed |

And none of those is a **Mongoose Schema**, which validates stored documents. When debugging a mismatch, say which schema you mean. It sounds fussy until the first time two people argue for an hour about different objects.

## Make composition fail

Reading about a conflict doesn't teach much, so here's a real one. Catalogue says a book's `pages` is an `Int!`. Archive stores it as text. Each schema is fine alone. This runs the real composer:

```ts
// @worked-example composition-conflict
import { composeServices } from '@apollo/composition';
import { parse } from 'graphql';

const link = `extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@shareable"])`;

export function compose(archivePagesType: string) {
  const result = composeServices([
    {
      name: 'catalogue',
      typeDefs: parse(`${link}
        type Book @key(fields: "isbn") { isbn: ID!, pages: Int! @shareable }
        type Query { book(isbn: ID!): Book }`),
    },
    {
      name: 'archive',
      typeDefs: parse(`${link}
        type Book @key(fields: "isbn") { isbn: ID!, pages: ${archivePagesType} @shareable }`),
    },
  ]);
  return result.errors?.map((error) => error.extensions.code) ?? [];
}
```

`compose('Int!')` returns an empty list. `compose('String!')` returns `['FIELD_TYPE_MISMATCH']`, and no supergraph comes out at all. That's the whole value of it: the disagreement is discovered by a build step, not by a customer.

`@shareable` is there because in Federation 2 a field is owned by one subgraph unless both sides explicitly agree to share it. Remove it and you get a different error, `INVALID_FIELD_SHARING`. Try it in the playground. Ownership is the default, and sharing is the exception.

## What it can't see

Composition reads schemas. It never runs a resolver, and that leaves a list of things that it can't possibly know:

```viz-flow
{
  title: 'Each check sees one layer',
  colWidth: 210,
  rowHeight: 96,
  nodes: [
    { id: 'sdl', label: 'Subgraph SDL', sub: 'does each one parse?', col: 0, row: 0, color: 'gql' },
    { id: 'comp', label: 'Composition', sub: 'do they agree?', col: 1, row: 0, color: 'gql' },
    { id: 'plan', label: 'Query execution', sub: 'do resolvers work?', col: 2, row: 0, color: 'mongo' },
    { id: 'attack', label: 'Hostile _entities', sub: 'do both doors hold?', col: 3, row: 0, color: 'forge' },
    { id: 'c1', label: 'catches', sub: 'typos, bad directives', col: 0, row: 1, color: 'neutral' },
    { id: 'c2', label: 'catches', sub: 'conflicting types, unreachable fields', col: 1, row: 1, color: 'neutral' },
    { id: 'c3', label: 'catches', sub: 'null in String!, wrong mapping', col: 2, row: 1, color: 'neutral' },
    { id: 'c4', label: 'catches', sub: 'cross-tenant reads', col: 3, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'sdl', to: 'comp' }, { from: 'comp', to: 'plan' }, { from: 'plan', to: 'attack' },
    { from: 'sdl', to: 'c1', dashed: true }, { from: 'comp', to: 'c2', dashed: true },
    { from: 'plan', to: 'c3', dashed: true }, { from: 'attack', to: 'c4', dashed: true },
  ],
  steps: [
    { focus: ['comp', 'c2'], caption: 'Composition is a promise check. It tells you the graph hangs together, and nothing about the data.' },
    { focus: ['plan', 'c3'], caption: 'A field declared String! can still return null at runtime. Only running it can tell you.' },
    { focus: ['attack', 'c4'], caption: 'An ordinary UI test never generates a foreign representation, so you have to write this attack yourself.' },
  ],
}
```

Relaydesk's forge test does all of it. It builds two real subgraph schemas, composes them, runs a query across both, and separately attacks `_entities` with a foreign tenant.

```quiz
Q: Composition succeeds, but a foreign tenant's contact is returned at runtime. Which check is missing?
- [ ] Another SDL syntax check
- [x] A behavior test for tenant isolation
- [ ] A larger supergraph
> Composition validates the graph's structure. It can't know which data a resolver may return to this caller.
```

## A query plan explains your latency

Before running a query, the router writes a **query plan**. It's worth being able to read one in your head:

```viz-sequence
{title:'A dependent fetch',actors:[{id:'r',label:'Router',color:'gql'},{id:'t',label:'Tickets',color:'gql'},{id:'c',label:'Contacts',color:'mongo'}],steps:[{from:'r',to:'t',label:'tickets + contact keys',note:'Fetch 1. It has to come first, since the keys it returns are the input to the next fetch.'},{from:'t',to:'r',label:'20 tickets',ret:true,payload:'{ contact: { __typename, tenant, id } }'},{from:'r',to:'c',label:'_entities(20 representations)',note:'Fetch 2. All twenty go in **one** call, so __resolveReference may run twenty times inside it.'},{from:'c',to:'r',label:'names',ret:true,note:'The total latency is at least fetch 1 + fetch 2. A fast ticket service can\'t hide a slow contact service.'}]}
```

Look at the third step. The router batches the representations, but your `__resolveReference` runs once per representation. If each one does its own `findOne`, you've rebuilt N+1 inside a subgraph. It's the same disease as Module 9, and the same cure: a DataLoader in the context. That's why real subgraphs keep `context.loaders` right next to `context.models`.

## The runtime you're using and the one you'll meet in production

Production setups often run **Apollo Router**, a separate Rust binary, and compose subgraphs with `rover`. Relaydesk uses **Apollo Gateway**, the JavaScript version, so that the whole lifecycle is inspectable in one Node process. The exercises use local data sources to avoid port juggling, while the final project talks real HTTP.

Everything you've learned carries over: ownership, representations, request identity, composition failures, partial responses. What doesn't carry over is network behavior. A local data source can't time out, so don't claim that it proved anything about timeouts.

## A trap at the resolver boundary

One more thing, and it has caught real teams. Back in Module 3 you learned that a Mongoose `Query` is lazy and can only run once. It's a *thenable*, not a Promise, so everything that awaits it starts another execution.

Normally you wouldn't notice. But tracing and instrumentation code wraps resolvers and may look at the returned value too:

```ts
// ✘ Hands the Query to whatever's watching. Observed twice, it runs twice,
// and you get "Query was already executed".
tickets: (_, __, ctx) => Ticket.find({ tenant: ctx.tenant }).lean(),

// ✔ .exec() starts it once and returns a real Promise.
tickets: (_, __, ctx) => Ticket.find({ tenant: ctx.tenant }).lean().exec(),
```

This one is nasty because local tests pass, and the error only appears when the server runs with some particular plugin. In a federated resolver, finish your queries with `.exec()`.

```quiz
Q: A __resolveReference does findOne for each representation, and a page of 50 tickets is slow. What's the fix?
- [ ] Remove the @key
- [ ] Ask the router to send one request per ticket
- [x] Batch inside the subgraph with a request-scoped DataLoader
> The router already batched the representations into one call. The N+1 is now inside your resolver, and it has the same cure as anywhere else.
```

## What's next

Time to build it. Relaydesk's tickets and contacts become two subgraphs, composed by a real gateway, and the tests attack the side door.
