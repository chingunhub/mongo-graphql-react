---
title: Mutations, errors and a resolver layout that scales
minutes: 16
---

Queries read; mutations change things. The mechanics are the same — a root field with a resolver — but the design questions are different: what do you accept, what do you return, and what happens when it fails? Then we'll arrange resolvers the way a big codebase does.

## Shape of a good mutation

```graphql
input AddReviewInput {
  bookId: ID!
  rating: Int!
  text: String
}

type Mutation {
  addReview(input: AddReviewInput!): Review!
  updateReview(id: ID!, input: UpdateReviewInput!): Review!
  deleteReview(id: ID!): ID!
}
```

Conventions you'll see in most codebases:

- **Verb + noun** names: `createIssue`, `updateIssue`, `assignIssue`. Prefer specific actions (`archiveProject`) over a generic `updateProject(archived: true)` when the action has its own rules.
- **One `input` argument** for creates and updates, plus the `id` for updates.
- **Return the changed object** — not `Boolean`. The client asked for this mutation so it can show the result; returning the object (with an `id`) also lets Apollo Client update its cache automatically (Module 11). Deletes usually return the deleted `ID`.

The resolver itself is usually thin — the real work belongs in the data layer you already built:

```ts
Mutation: {
  addReview: async (_parent, { input }, ctx) => {
    const { bookId, ...rest } = input;
    return Review.create({ ...rest, book: bookId, by: ctx.currentUser._id });
  },
},
```

Notice the input's **field names don't have to match** the model's: the API says `bookId` (it's an id, so say so), the model stores `book`. The resolver is the translation layer. Keep translation *here* and keep business rules in the data/service layer.

## Throwing errors from resolvers

When something's wrong — the book doesn't exist, say — throw. GraphQL catches it, records it in `errors` with the field's path, and puts `null` in `data` (bubbling up through non-null fields as you saw):

```ts
import { GraphQLError } from 'graphql';

updateReview: async (_parent, { id, input }) => {
  const review = await Review.findByIdAndUpdate(id, { $set: input }, { returnDocument: 'after', runValidators: true });
  if (!review) {
    throw new GraphQLError('Review not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }
  return review;
},
```

```json
{
  "data": null,
  "errors": [{
    "message": "Review not found",
    "path": ["updateReview"],
    "extensions": { "code": "NOT_FOUND" }
  }]
}
```

The **`extensions.code`** is the part clients branch on — messages are for humans and change; codes are a contract. Apollo Server already uses some codes (`BAD_USER_INPUT`, `GRAPHQL_VALIDATION_FAILED`, `INTERNAL_SERVER_ERROR`…), and you add your own, like `NOT_FOUND`. Module 8 builds a proper error layer; for now, throw a `GraphQLError` with a code when something isn't found.

What about errors you *don't* throw on purpose — a Mongoose `ValidationError` from `Review.create`? It still lands in `errors` (code `INTERNAL_SERVER_ERROR`), with Mongoose's message. Not great, not broken. Module 8 turns those into clean `BAD_USER_INPUT` errors with per-field details.

## Partial updates, carefully

`UpdateReviewInput` has only optional fields. Pass the input through to your repository's "patch" function, preserving the absent-vs-null distinction from the last lesson:

```ts
const { bookId, ...patch } = input;  // rename/translate fields that differ
if (bookId !== undefined) patch.book = bookId; // keep null as null, skip undefined
```

`!== undefined` (not truthiness!) is the check that keeps "clear this field" possible.

## Mutations run in order

As you saw in the execution lesson, root mutation fields execute **sequentially**:

```graphql
mutation {
  first: addReview(input: { bookId: "b1", rating: 5 }) { id }
  second: addReview(input: { bookId: "b1", rating: 4 }) { id }
}
```

`first` completes before `second` starts. Queries make no such promise.

## A resolver layout that scales

A 1,500-line `resolvers.ts` is how codebases become unnavigable. Split by **domain**, mirroring the schema files:

```viz-flow
{
  colWidth: 175,
  rowHeight: 64,
  nodes: [
    { id: 's1', label: 'schema/book.ts', col: 0, row: 0, color: 'gql' },
    { id: 's2', label: 'schema/author.ts', col: 0, row: 1, color: 'gql' },
    { id: 'r1', label: 'resolvers/book.ts', col: 1, row: 0, color: 'gql' },
    { id: 'r2', label: 'resolvers/author.ts', col: 1, row: 1, color: 'gql' },
    { id: 'idx', label: 'resolvers/index.ts', sub: '[book, author]', col: 2, row: 0.5, color: 'gql' },
    { id: 'srv', label: 'server.ts', sub: 'createApolloServer()', col: 3, row: 0.5, color: 'forge' },
  ],
  edges: [
    { from: 's1', to: 'r1', dashed: true }, { from: 's2', to: 'r2', dashed: true },
    { from: 'r1', to: 'idx' }, { from: 'r2', to: 'idx' }, { from: 'idx', to: 'srv' },
  ],
}
```

Each domain file exports a resolver map with whatever keys it owns — including root fields:

```ts title="resolvers/book.ts"
export const bookResolvers = {
  Query: { books: …, book: … },
  Mutation: { addBook: … },
  Book: { id: …, author: …, createdAt: … },
};
```

```ts title="resolvers/author.ts"
export const authorResolvers = {
  Query: { authors: … },
  Author: { id: …, books: … },
};
```

Apollo Server accepts an **array** of resolver maps and merges them — `Query` from both files combine into one:

```ts title="resolvers/index.ts"
export const resolvers = [bookResolvers, authorResolvers];
```

```ts title="server.ts"
import { ApolloServer } from '@apollo/server';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';

export function createApolloServer() {
  return new ApolloServer({ typeDefs, resolvers });
}
```

A **factory function** instead of a module-level `const server = new ApolloServer(...)` matters more than it looks: tests can create a fresh server each time, and the startup code (Module 13) decides when to start it. Big-codebase rule of thumb: **importing a module shouldn't start things.**

### Finding things in a codebase like this

When a bug report says "`Issue.assignee` shows the wrong person", the path is now predictable:

1. `schema/issue.ts` — what's the field's type and arguments?
2. `resolvers/issue.ts` → `Issue.assignee` — what does it load, from which parent property?
3. the repository/model it calls.

That's the habit to build: **schema → resolver → data layer.** Every GraphQL codebase you'll join has some version of this map.

## Testing without HTTP

`server.executeOperation()` runs an operation through the full pipeline (parse, validate, execute, error formatting) without a network:

```ts
const server = createApolloServer();
const res = await server.executeOperation(
  { query: 'mutation($input: AddReviewInput!) { addReview(input: $input) { id rating } }', variables: { input } },
  { contextValue: { currentUser: sam } }, // context you'd normally build from the request
);
// res.body.singleResult → { data, errors }
```

That's exactly how this course's hidden tests talk to your Taskforge server.

```quiz
Q: A mutation resolver does `const patch = { ...input, assignee: input.assigneeId || null }`. What's the bug?
- [ ] `||` is slower than `??`
- [x] An omitted `assigneeId` becomes `null`, so every update unassigns the issue
- [ ] Nothing — null and undefined mean the same in MongoDB updates
> Omitted → undefined → `|| null` → null → "unassign". Use `if (input.assigneeId !== undefined) patch.assignee = input.assigneeId`.
```

```quiz
Q: Two files both export a resolver map with a `Query` key. What happens when you pass `[a, b]` as `resolvers` to Apollo Server?
- [ ] The second Query overwrites the first
- [x] They're merged: Query gets the fields from both
- [ ] Startup error: duplicate Query
> Resolver maps are merged field by field. (Defining the *same* field in both is where conflicts begin — keep each field in exactly one domain file.)
```
