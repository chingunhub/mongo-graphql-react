---
title: "Drill: a recipes API on Mongoose"
kind: drill
db: true
summary: Resolvers over real models — lean objects, dates, bad ids, and NOT_FOUND errors.
focus: [graphql/resolvers.ts, graphql/schema.ts, models/Recipe.ts, playground.ts]
readonly: [models/Recipe.ts, graphql/schema.ts]
needs: [m07/l1-resolver-anatomy, m07/l2-mutations-modules]
---

The recipe app from module 1 is getting a GraphQL API. The model and the schema are done (read both). You write the resolvers and the server factory.

Every one of the four traps from the lesson is waiting in here. The tests will find them if you don't.

## Your task

In `graphql/resolvers.ts`:

- **`Query.recipes(tag, maxMinutes)`** — both optional. Sorted by `minutes`, then `title`. Use **`.lean()`** here (it's a list endpoint; the team wants it light) — and make sure everything still resolves.
- **`Query.recipe(id)`** — the recipe, or `null` when it doesn't exist **or `id` isn't a valid ObjectId** (no `CastError` leaking out).
- **`Recipe.id`**, **`Recipe.createdAt`** (ISO-8601 string), **`Recipe.ingredientCount`** — make them work for both documents and lean objects.
- **`Mutation.addRecipe(input)`** — creates and returns the recipe. `tags` and `ingredients` may be omitted.
- **`Mutation.addIngredient(recipeId, ingredient)`** — appends the ingredient (atomically, without loading the recipe first) and returns the **updated** recipe. Unknown recipe → a `GraphQLError` with message `Recipe not found` and `extensions.code` `NOT_FOUND`.
- **`Mutation.deleteRecipe(id)`** — `true` if a recipe was deleted, `false` if there was nothing to delete.

In `server.ts`: **`createServer()`** returns an `ApolloServer` with the schema and your resolvers.

## Hints

### lean + id + dates
With `.lean()`, `recipe.id` doesn't exist and `createdAt` is a `Date`. Resolvers like `id: (r) => String(r._id)` and `createdAt: (r) => r.createdAt.toISOString()` work for both shapes.

### "Query was already executed"
That's the trap from the start of the lesson: a resolver returned a Mongoose Query instead of a Promise. End the chain with `.exec()`, or make the resolver `async` and `await` the query.

### Bad ids
`mongoose.isValidObjectId(id)` before querying. For `addIngredient` and `deleteRecipe`, a malformed id simply means "not found".

### Atomic append
`Recipe.findByIdAndUpdate(recipeId, { $push: { ingredients: ingredient } }, { returnDocument: 'after', runValidators: true })` returns `null` when nothing matched. `deleteOne` returns `{ deletedCount }`.
