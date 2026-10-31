---
title: The type system and SDL
minutes: 17
---

The schema is the **contract** between your API and every client that will ever use it. In a big codebase it's also the best map you'll get: open the schema, and you know what the system can do before reading a single resolver. It's written in **SDL** — the Schema Definition Language.

## Object types and scalars

```graphql title="Bookshelf schema"
"""A book on the shelf."""
type Book {
  id: ID!
  title: String!
  year: Int
  rating: Float
  inPrint: Boolean!
  author: Author!
  tags: [String!]!
}

type Author {
  id: ID!
  name: String!
  books: [Book!]!
}
```

A **type** has **fields**; each field has a type. Fields whose types are other object types (`author: Author!`) are what make it a *graph*: clients can walk from a book to its author to their other books.

The five built-in **scalars** — the leaves of every query:

| Scalar | Is | Notes |
| --- | --- | --- |
| `Int` | 32-bit signed integer | > 2,147,483,647 fails; use `Float` or a string for big numbers |
| `Float` | double | |
| `String` | UTF-8 text | |
| `Boolean` | true / false | |
| `ID` | a unique identifier | serialized as a string; signals "don't do math on this" |

There's no built-in date. Common choices: an ISO-8601 `String`, or a **custom scalar** like `DateTime` that validates and converts for you. Taskforge uses ISO strings to keep things explicit — and you'll see in Module 7 why "just return the Date object" doesn't do what you'd think.

`"""triple-quoted text"""` before a type or field is a **description**. It shows up in tooling and introspection. In a shared schema, describe anything whose meaning isn't obvious from its name.

## Non-null and lists

By default **every field is nullable**. A `!` makes it non-null: the server promises a value. Square brackets make a list. They combine, and the combinations trip everyone up at first:

```viz nullability
```

Read from the inside out: `[String!]!` is "a non-null list of non-null strings". The most common shapes in practice:

- `[Issue!]!` — "always a list (maybe empty), never containing nulls". The default choice for collections.
- `Issue` (nullable) — for lookups that may find nothing: `issue(id: ID!): Issue`.
- `String!` — fields that genuinely always exist, like a title.

### Choosing nullability is an API design decision

Non-null is a **promise**, and it's hard to take back — changing `String!` to `String` is a breaking change for clients that assumed a value. And there's a subtler cost you'll see in the next lesson: if a non-null field fails to resolve, the null **propagates upward** and can wipe out a much bigger part of the response.

Practical rules:

- Make a field non-null when the value **always** exists and computing it can't reasonably fail (`id`, `title`, `createdAt`).
- Keep it nullable when it's optional in the domain (`assignee`), when it's looked up by id (`issue(id)`), or when it depends on another service that might be down.
- Arguments are the opposite: `issue(id: ID!)` — make **inputs** strict, so bad requests fail validation early.

## Enums

```graphql
enum Format {
  HARDCOVER
  PAPERBACK
  EBOOK
}
```

An enum is a scalar with a fixed set of values. Clients can't send anything else — the server rejects it during validation, before any of your code runs. Use them wherever your Mongoose schema has an `enum`; the two lists should match exactly.

## Arguments, inputs and defaults

Any field can take arguments, with optional defaults:

```graphql
type Author {
  books(format: Format, sort: BookSort = NEWEST, limit: Int = 20): [Book!]!
}
```

When arguments are a structured bundle — especially for mutations — group them into an **input type**:

```graphql
input AddBookInput {
  title: String!
  year: Int
  authorId: ID!
  tags: [String!]
}

type Mutation {
  addBook(input: AddBookInput!): Book!
}
```

Input types look like object types but use `input`, and their fields can only be scalars, enums, or other inputs (no resolvers, no cycles back to object types). Why bother instead of `addBook(title: String!, year: Int, …)`? You can add fields without changing the mutation's signature, the same input can be reused, and clients send one `$input` variable instead of six.

## Root types: Query and Mutation

`Query` and `Mutation` are ordinary object types with a special job: they're the **entry points**. Every operation starts at one of them.

```graphql
type Query {
  books(tag: String): [Book!]!
  book(id: ID!): Book
}

type Mutation {
  addBook(input: AddBookInput!): Book!
}
```

## Splitting a schema across files

In a real codebase you don't keep a 2,000-line schema in one file. Each domain owns its part, using `extend type` to add root fields:

```ts title="graphql/schema/base.ts"
export const baseTypeDefs = /* GraphQL */ `
  type Query
  type Mutation
`;
```

```ts title="graphql/schema/book.ts"
export const bookTypeDefs = /* GraphQL */ `
  type Book { id: ID!  title: String! }

  extend type Query {
    books: [Book!]!
  }
`;
```

```ts title="graphql/schema/index.ts"
export const typeDefs = [baseTypeDefs, bookTypeDefs, authorTypeDefs];
```

`type Query` with no fields declares the root; each module `extend`s it. Apollo Server accepts an array of typeDefs and merges them. (The `/* GraphQL */` comment is just a hint that editor plugins use to syntax-highlight the string.)

Taskforge's schema will be laid out exactly like this, so when you're looking for "where is `createIssue` defined?", the answer is `schema/issue.ts`.

## A taste of abstract types

Two more type kinds, which you'll use in Module 9:

```graphql
# a field that can return different object types
union SearchResult = Book | Author

# a contract several types share
interface Node { id: ID! }
type Book implements Node { id: ID!  title: String! }
```

## Schema evolution

Because many clients depend on the schema, you change it carefully:

- **Adding** a type, a field, or an *optional* argument is safe.
- **Removing** or **renaming** a field, making a nullable field non-null in an *input*, or making a non-null *output* field nullable — breaking.
- To retire a field, mark it and remove it later: `oldField: String @deprecated(reason: "Use newField")`.

This is why big codebases often have slightly odd-looking schemas: `issues` *and* `issueConnection` side by side, because the newer one was added rather than replacing the old one. You'll do exactly that in Module 9.

```quiz
Q: `labels: [Label!]!` — which of these responses is valid for that field?
- [ ] `null`
- [x] `[]`
- [ ] `[{ "name": "bug" }, null]`
> The outer `!` forbids null for the list; the inner `!` forbids null items. An empty list is always allowed.
```

```quiz
Q: Your Mongoose schema has `status: { enum: ['TODO', 'DONE'] }`. Best GraphQL type for the field?
- [ ] `status: String!`
- [x] `status: IssueStatus!` with `enum IssueStatus { TODO DONE }`
- [ ] `status: [String!]!`
> An enum makes the allowed values part of the contract: clients can't send other values, and tools can autocomplete them.
```
