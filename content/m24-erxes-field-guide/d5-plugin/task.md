---
title: 'Capstone: a plugin in the erxes shape'
kind: drill
db: true
summary: 'Build a real plugin on an erxes-shaped kit, from models to GraphQL to tRPC, and prove it over HTTP.'
focus: ['main.ts', 'connectionResolvers.ts', 'modules/tickets/graphql/resolvers.ts']
readonly: ['erxes-api-shared/index.ts', 'modules/tickets/db/definitions/tickets.ts']
---

Everything from this module, in one plugin. When you finish, `backend/plugins/sales_api` should look like a bigger version of something you've built, and that's the reason this exists.

`erxes-api-shared` is a small stand-in with the real names and call shapes. Read it first. The tests start your plugin on a real port and talk to it over HTTP, and a second plugin plays the part of contacts. There's no mock of your own code anywhere.

```viz-sequence
{
  title: 'One request through your plugin',
  actors: [
    { id: 'c', label: 'Caller', color: 'neutral' },
    { id: 'p', label: 'startPlugin', sub: 'kit', color: 'forge' },
    { id: 'r', label: 'Your resolvers', color: 'gql' },
    { id: 'm', label: 'models', sub: 'north database', color: 'mongo' },
    { id: 'o', label: 'contacts plugin', color: 'react' },
  ],
  steps: [
    { from: 'c', to: 'p', label: 'POST /graphql', note: 'With `x-subdomain: north` and a base64 `user` header.' },
    { from: 'p', to: 'r', label: 'context', note: 'Your `apolloServerContext` adds `models` and fresh `loaders`.' },
    { from: 'r', to: 'm', label: 'context.models', note: 'A guard has already run. Your resolver only sees this tenant.' },
    { from: 'r', to: 'o', label: 'one contacts.find', note: 'However many tickets need a contact, this is one batched message.' },
    { from: 'r', to: 'c', label: 'tickets with contacts', ret: true, note: 'If contacts is down, `contact` is `null` and the tickets still arrive.' },
  ],
}
```

## Your task

### 1. `connectionResolvers.ts` and the model

`loadClasses` builds `{ Tickets }`, with the model named `tickets`. `generateModels` is already wired to the kit.

| Static | Behavior |
| --- | --- |
| `getTicket(_id)` | Returns it, or throws `Ticket not found` |
| `raiseTicket(_id)` | Atomically sets `priority` to `high` and returns the updated ticket. Throws `Ticket not found` |

### 2. The schema in `typeDefs.ts`

```graphql
type Contact { _id: ID!  name: String! }

type Ticket  # an entity keyed on _id
  _id: ID!
  subject: String!
  priority: String!
  contactId: ID
  contact: Contact

type Query:
  tickets(priority: String): [Ticket!]!
  ticket(_id: ID!): Ticket!

type Mutation:
  ticketAdd(subject: String!, contactId: ID): Ticket!
  ticketRaise(_id: ID!): Ticket!
```

### 3. Guards and resolvers in `resolvers.ts`

| Rule | Detail |
| --- | --- |
| Login | Required for every query and mutation |
| Permission | `ticketRaise` requires the `tickets:manage` action |
| Tenant | Only `context.models`, always |
| Entity | `Ticket.__resolveReference` finds by `_id`, and requires a login too |
| Contact | `Ticket.contact` uses `context.loaders.contact`. No `contactId` means `null`, with no lookup |

### 4. `createLoaders(subdomain)` in `loaders.ts`

Each load batch sends one message:

```ts
sendTRPCMessage({
  subdomain,
  pluginName: 'contacts',
  module: 'contacts',
  action: 'find',
  input: { ids: [...ids] },
  defaultValue: [],
});
```

It returns `{ _id, name }` objects, in no promised order and without any it didn't find.

### 5. `tickets.count` in `trpc.ts`

A query taking `{ priority?: string }`, validated with Zod, that counts tickets in the caller's subdomain.

### 6. `startTickets()` in `main.ts`

Call `startPlugin` with the name `tickets`, and return its result. Build the GraphQL context and the tRPC context, each with the subdomain's models. The GraphQL context also gets fresh loaders.

## Hints

### Start with the model and one query
Get `tickets` working over HTTP before anything else. An early failure in `main.ts` will fail every test at once, so read the first error.

### The kit is the documentation
What does `startPlugin` hand to `apolloServerContext`? What must that function return?

### The second door
`moduleRequireLogin` wraps the functions in the object you give it. Which ways into this plugin aren't in those objects? What's different about the arguments there?

### Batching with DataLoader
What must a batch function return, and in what order, when a contact is missing?
