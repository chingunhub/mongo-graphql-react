---
title: "Drill: a tiny library API"
kind: drill
summary: Your first Apollo Server — resolvers that bridge the stored shape and the schema's shape, plus a mutation.
focus: [server.ts, data.ts, playground.ts]
readonly: [data.ts]
needs: [m06/l3-execution, m06/l2-type-system]
---

Your first real GraphQL server. The data lives in memory (`data.ts`) so you can focus on the GraphQL side. Look at the data first: books store an **`authorId`**, but the schema exposes an **`author`** object. Bridging "how it's stored" and "how it's exposed" is most of what resolvers do.

## Your task

In `server.ts`:

1. **Finish the SDL.** The types and queries are written. Add:
   - an input type `AddBookInput` with `title` (required string), `year` (required int), `genre` (required `Genre`) and `authorId` (required id),
   - a `Mutation` type with `addBook(input: AddBookInput!): Book!`.

2. **Write the resolvers** so that:
   - `books(genre)` returns all books, or only that genre when given — **sorted by `year`, oldest first**.
   - `book(id)` returns the book or `null`.
   - `authors` returns all authors.
   - `Book.author` returns the author object for the book's `authorId`.
   - `Author.books` returns that author's books, oldest first.
   - `addBook(input)` creates a book with a new unique `id`, adds it to the data, and returns it. If `authorId` doesn't match an author, throw a `GraphQLError` with the message `Unknown author` (import it from `graphql`).

3. **`createServer()`** returns a `new ApolloServer({ typeDefs, resolvers })`.

The playground runs a few operations through `server.executeOperation(...)` — that's Apollo Server's way of running an operation without HTTP, which is also how the tests (and Apollo's own docs) test servers.

## Hints

### Which resolvers do you need?
Only for fields where `parent[fieldName]` wouldn't produce the right value. `Book.title`? The default resolver handles it. `Book.author`? The book object has no `author` property — only `authorId`. That one needs a resolver.

### Resolver signatures
`Query: { books: (_parent, args) => … }` — `args.genre` is `undefined` when not passed. For `Book: { author: (book) => … }`, the first argument is the book object returned by the parent resolver.

### Don't sort in place
`books.sort(...)` mutates the shared array. Copy first: `[...books].sort(...)` or `books.filter(...).sort(...)` (filter already returns a new array).
