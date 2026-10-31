---
title: "An entity reference is a message"
minutes: 24
---

Up to now, one GraphQL server has answered every field. You've written `Ticket.assignee` a dozen ways, and each time the resolver could reach into the database and fetch the user.

Now picture a company where the tickets team and the contacts team are different teams, with different services and different databases. The inbox still wants a ticket and its contact's name in one query. The client shouldn't care how many services that takes.

**Federation** gives you that: several GraphQL services, called **subgraphs**, composed into one graph, with a **router** in front. Big plugin-based systems work exactly like this. Each plugin is a subgraph, and if you open one you'll find the `@key` and `__resolveReference` you're about to learn.

Federation coordinates services, but it doesn't merge them. They still have separate databases and they can still fail independently.

## Who owns what

Let's use a library. Loans owns `dueDate`, and Catalogue owns `title`. A client asks:

```graphql
{ loans { dueDate book { title } } }
```

Loans has no idea what the title is, and importing Catalogue's database would defeat the point of having two services. What Loans *can* do is say which book it means. The router carries that message to the owner.

```viz-sequence
{title:'Following a federated entity',actors:[{id:'client',label:'Client',color:'react'},{id:'router',label:'Router',color:'gql'},{id:'loan',label:'Loans',color:'gql'},{id:'cat',label:'Catalogue',color:'mongo'}],steps:[{from:'client',to:'router',label:'loans { book { title } }',note:'One query. The client has no idea that two services are involved.'},{from:'router',to:'loan',label:'loans + book key',note:'The router knows `title` belongs elsewhere, so it asks Loans only for the key.'},{from:'loan',to:'router',label:'Book representation',ret:true,payload:'{ __typename: "Book", library: "north", isbn: "42" }',note:'A **representation** is plain data: the type name plus every key field.'},{from:'router',to:'cat',label:'_entities(representations)',note:'Catalogue turns that identity back into a record and checks **its own** request context.'},{from:'cat',to:'router',label:'title',ret:true},{from:'router',to:'client',label:'combined result',ret:true,note:'The client sees one response.'}]}
```

That representation is the title of this lesson. It's like following a foreign key, except the lookup crosses a service boundary, so it's a **message**. And since it's a message, it can be incomplete, stale or forged.

## Keys are identity contracts

Say two libraries both have ISBN 42 in their local catalogues. Then `isbn` alone doesn't identify a book. You need a **compound key**: library and ISBN together. You've met this idea twice already.

| Layer | What says "same thing" | Example |
| --- | --- | --- |
| MongoDB | unique index | `{ tenant: 1, sourceId: 1 }` |
| Apollo Client | cache key (Module 11) | `keyFields` |
| Federation | `@key` | `@key(fields: "library isbn")` |

Each solves the same problem at a different boundary, and each one breaks in the same way when part of the identity goes missing.

In a subgraph you declare the key with `@key`, and write a `__resolveReference` resolver that turns a representation into a real record. `buildSubgraphSchema` adds two fields for the router's use: `_service` and `_entities`. You won't write those, but you do have to understand them, and here's why.

> [!WARNING] A key is a claim, not a permission
> `_entities` is a query field, so **anyone who can reach the subgraph can call it**, with any representation they like. A representation saying `library: "south"` is just a string from a caller. It does not make that caller South.

## Watch both doors

So a subgraph has two entry points to the same data. The ordinary query is the door everybody thinks about. `_entities` is the side door. In this Catalogue, both libraries reuse ISBN 42, so a sloppy identity check shows up immediately:

```ts
// @worked-example federation-book
import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';

type Context = { library: string }; // supplied by trusted request middleware
const books = [
  { library: 'north', isbn: '42', title: 'The Dispossessed' },
  { library: 'south', isbn: '42', title: 'Different catalogue entry' },
];
const lookup = (library: string, isbn: string) =>
  books.find(book => book.library === library && book.isbn === isbn) ?? null;

export const bookSchema = buildSubgraphSchema([{
  typeDefs: parse(`
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])
    type Book @key(fields: "library isbn") { library: ID!, isbn: ID!, title: String! }
    type Query { book(isbn: ID!): Book }
  `),
  resolvers: {
    Query: {
      book: (_: unknown, args: { isbn: string }, ctx: Context) =>
        lookup(ctx.library, args.isbn),
    },
    Book: {
      __resolveReference: (ref: { library: string; isbn: string }, ctx: Context) =>
        ref.library === ctx.library ? lookup(ctx.library, ref.isbn) : null,
    },
  },
}]);
```

Three things to notice:

- The `@link` line is what makes this a Federation 2 schema, and it declares which directives you import.
- A normal client calls `book(isbn: "42")`. The tenant comes from context, not the arguments.
- `__resolveReference` receives `(representation, context)`, in that order. It compares the claim with the trusted value *before* looking anything up.

Under North's context, predict these two representations:

```ts
{ __typename: 'Book', library: 'north', isbn: '42' } // ?
{ __typename: 'Book', library: 'south', isbn: '42' } // ?
```

You get North's book, and then `null`. Calling `_entities` directly bypasses the ordinary query, but it doesn't bypass the check, because the check lives in both doors.

```quiz
Q: A reference contains {__typename: 'Book', id: '7'}, but the entity key is 'library id'. What's wrong?
- [ ] Nothing, __typename makes the ID globally unique
- [x] The representation is missing part of the identity
- [ ] Compound keys only matter for database indexes
> The receiving service needs the full key. A TypeScript cast can't fill in a missing field at runtime.
```

## The other side of the reference

That's the owner. What does Loans look like? It doesn't own `Book`, but it needs to point at one. So it declares a **stub**: the key fields and nothing else, marked `resolvable: false`, which promises the router that Loans can't answer anything about books.

```graphql
type Book @key(fields: "library isbn", resolvable: false) {
  library: ID!
  isbn: ID!
}

type Loan {
  id: ID!
  dueDate: String!
  book: Book
}
```

And the resolver has barely anything to do:

```ts
Loan: {
  book: (loan) => ({ __typename: 'Book', library: loan.library, isbn: loan.bookIsbn }),
},
```

No database call and no import from Catalogue. The resolver returns the *identity*, and the router does the rest. Coming from one big server, this feels almost like cheating. It also means there's a whole class of N+1 problem that the Loans service doesn't have, since it no longer fetches books.

## Missing, forbidden and broken are different

Now, the book a loan points at may have been deleted. If `Loan.book` is nullable, the client gets `book: null` and the loan survives. If you declared it `Book!`, that null travels upward, as you saw in Module 6, and can wipe out the loan or even the whole list.

```viz nullability
{}
```

So a reference across services is usually **nullable**. Another team owns that data, and you can't promise that it's there, or that their service is up. Don't mark every field non-null just to avoid thinking about it. And when a subgraph is down, the client can get partial data along with errors, which is one more reason to decide this deliberately.

```quiz
Q: In a Federation setup, the Tickets subgraph has a contact reference and the Contacts subgraph is down. With a nullable contact field, what does the client get?
- [ ] A total failure of the query, always
- [x] Tickets with contact null, plus an error describing the failed part
- [ ] An empty ticket list and no errors
> Nullable fields give GraphQL somewhere to put the failure. The ticket data survives, and the errors array tells the truth about what's missing.
```

## What's next

The next drill runs real `_entities` queries through `@apollo/subgraph`. It's about warehouse stock, so you have to transfer the mechanism and not just copy Book. After that, Module 17's second lesson asks what composing two subgraphs can and can't promise.
