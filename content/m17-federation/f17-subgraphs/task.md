---
title: "Relaydesk: contacts and tickets compose"
kind: "forge"
workspace: "relaydesk"
db: true
summary: "Expose two real subgraphs with compound contact identity."
focus: ["services/subgraphs.ts"]
readonly: ["services/contacts/model.ts"]
---

So far a ticket has only a `contactId`, a string that points at nothing. Now the inbox needs the contact's name, and contacts belong to a different service. You'll split Relaydesk's graph into two subgraphs, and a real gateway will join them.

```viz-tree
{
  title: 'Who answers each field of one query',
  root: { id: 'q', label: 'tickets', value: 'Tickets subgraph', color: 'gql', children: [
    { id: 'sub', label: 'subject, priority, version', value: 'Tickets subgraph', color: 'gql' },
    { id: 'c', label: 'contact', value: 'a reference, no database call', color: 'forge', children: [
      { id: 'cid', label: 'tenant, id', value: 'in the reference', color: 'forge' },
      { id: 'name', label: 'name', value: 'Contacts subgraph', color: 'mongo' },
    ] },
  ] },
}
```

## Your task

Both functions in `services/subgraphs.ts` return a `GraphQLSchema` from `@apollo/subgraph`, and both schemas use the Federation 2 `@link`. The `Contact` model is provided.

### 1. `contactSubgraph()`

```graphql
type Contact @key(fields: "tenant id") {
  tenant: ID!
  id: ID!
  name: String!
}

type Query {
  contact(id: ID!): Contact
}
```

- `Query.contact` looks in the context's tenant, and returns `null` when nothing's there.
- `Contact.__resolveReference` returns `null` for a foreign tenant or a missing contact.

### 2. `ticketSubgraph()`

- A `Contact` stub with the same key, `resolvable: false`, and only `tenant` and `id`.
- `Ticket` with `id: ID!`, `tenant: ID!`, `subject: String!`, `priority: String!`, `version: Int!`, and a nullable `contact: Contact`.
- `Query.tickets: [Ticket!]!` returns only this tenant's tickets, sorted by `_id` ascending.
- `Ticket.id` comes from `_id`. `Ticket.contact` returns a representation, using `contactId` as the contact's `id`. Don't import the Contact model here.

### 3. Guard every entry

Require `tickets:read` at **every** entry point: both queries and the reference resolver.

A ticket with a deleted contact must come back with `contact` resolved to `null`, while the ticket itself stays.

> [!NOTE]
> The tests compose your two schemas with Apollo Gateway, and run `{ tickets { subject contact { name } } }` across them. Then they call `_entities` directly, as an attacker would.

## Hints

### A reference is enough
Look at the lesson's `Loan.book`. How many database calls does it make?

### Which tenant?
A contact's key has two fields. Where does the ticket resolver get the tenant part?

### Two doors
List every resolver that can return a `Contact` without going through `Query.contact`.

### A Mongoose detail
The ticket list is a Query. How do you finish it so a tracer can't run it a second time?
