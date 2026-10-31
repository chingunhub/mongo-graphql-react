---
title: Errors clients can rely on
minutes: 17
---

Every API fails. The difference between a pleasant one and a miserable one is whether failures are **predictable**: the same kind of problem always looks the same, carries a machine-readable code, says which field is wrong, and never leaks your internals. This lesson builds that.

## Two kinds of failure

| | Client errors | Server errors |
| --- | --- | --- |
| Cause | the request is wrong | the server is wrong (bug, outage) |
| Examples | invalid input, not logged in, not allowed, not found | null pointer, DB timeout, unhandled CastError |
| Message to the user | specific and actionable | generic: "Something went wrong" |
| Your logs | usually not interesting | **very** interesting — with details and an id |

The codes you'll use (Apollo's built-ins, plus common ones you set yourself, marked custom):

| `extensions.code` | Meaning | Client typically… |
| --- | --- | --- |
| `GRAPHQL_PARSE_FAILED` / `GRAPHQL_VALIDATION_FAILED` | the query itself is broken (HTTP 400) | a bug in the client |
| `BAD_USER_INPUT` | arguments failed validation | shows field errors in the form |
| `UNAUTHENTICATED` (custom) | not logged in / token invalid | redirects to login |
| `FORBIDDEN` (custom) | logged in, but not allowed | shows "you don't have access" |
| `NOT_FOUND` (custom) | the thing doesn't exist (or isn't visible) | shows a 404 state |
| `INTERNAL_SERVER_ERROR` | anything you didn't anticipate | shows a generic error, retries |

> [!BRIDGE]
> In REST, the status code carries the failure: 400, 401, 403, 404, 500. In GraphQL, an error thrown by a resolver usually arrives with HTTP 200, in an `errors` array beside `data`, because one request can half succeed. `extensions.code` does the job the status code did, so check it rather than `response.status`.

## An errors module

Don't construct `new GraphQLError(...)` with hand-typed codes all over the codebase — someone will type `NOT_FOUNDD`. Centralize:

```ts title="graphql/errors.ts"
import { GraphQLError } from 'graphql';

export const badInput = (message: string, fields?: Record<string, string>) =>
  new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', ...(fields && { fields }) } });
export const unauthenticated = () =>
  new GraphQLError('You must be logged in', { extensions: { code: 'UNAUTHENTICATED' } });
export const forbidden = (message = 'You are not allowed to do that') =>
  new GraphQLError(message, { extensions: { code: 'FORBIDDEN' } });
export const notFound = (what: string) =>
  new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } });
```

Resolvers read like sentences: `if (!issue) throw notFound('Issue')`.

## Turning Mongoose errors into client errors

When `Issue.create(...)` fails validation inside a resolver, Apollo Server reports it as `INTERNAL_SERVER_ERROR` with Mongoose's raw message — technically "the server didn't handle this", but really it's the user's input that was wrong. You *could* wrap every mutation in try/catch. Better: translate in **one place**, Apollo Server's `formatError` hook, which sees every error on its way out:

```viz-flow
{
  colWidth: 190,
  rowHeight: 74,
  nodes: [
    { id: 'r', label: 'resolver throws', sub: 'anything', col: 0, row: 0.5, color: 'gql' },
    { id: 'f', label: 'formatError()', sub: 'one place', col: 1, row: 0.5, color: 'forge' },
    { id: 'gql', label: 'GraphQLError', sub: 'has a code → pass through', col: 2, row: 0, color: 'ok' },
    { id: 'mv', label: 'Mongoose ValidationError', sub: '→ BAD_USER_INPUT + fields', col: 2, row: 1, color: 'ok', w: 175 },
    { id: 'other', label: 'anything else', sub: '→ log it, mask it', col: 2, row: 2, color: 'bad' },
  ],
  edges: [
    { from: 'r', to: 'f' }, { from: 'f', to: 'gql' }, { from: 'f', to: 'mv' }, { from: 'f', to: 'other' },
  ],
}
```

```ts title="graphql/errors.ts"
import mongoose from 'mongoose';
import { unwrapResolverError } from '@apollo/server/errors';
import type { GraphQLFormattedError } from 'graphql';

export function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = unwrapResolverError(error); // the thing your resolver actually threw

  if (original instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(original.errors).map(([path, e]) => [path, e.message]));
    return { ...formatted, message: 'Invalid input', extensions: { code: 'BAD_USER_INPUT', fields } };
  }

  if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
    console.error(original); // the real details go to YOUR logs…
    return { message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }; // …not to the client
  }

  return formatted;
}
```

```ts
new ApolloServer({ typeDefs, resolvers, formatError });
```

> [!CAUTION] Apollo Server does not hide your error messages
> If a resolver throws `new Error('connect ECONNREFUSED 10.0.3.12:27017')`, that message goes to the client **as-is** — even with `NODE_ENV=production` (which only strips stack traces). This was checked against Apollo Server 5 in this sandbox. Masking unexpected errors is **your** job, and `formatError` is where it happens.

> [!WARNING] Two things named "ValidationError"
> GraphQL's own query-validation errors (`GRAPHQL_VALIDATION_FAILED`) are *also* objects whose `name` is `"ValidationError"`. Checking `err.name === 'ValidationError'` would treat a client's malformed query as a Mongoose problem. Use `instanceof mongoose.Error.ValidationError`. Names collide in big codebases constantly — prefer `instanceof` or explicit codes over string names.

What about duplicates (`E11000`) and `CastError`s? Same idea: they're client mistakes (an email that's taken, a malformed id), so map them to `BAD_USER_INPUT` too. The *message* can stay human: "That email is already registered".

## Errors and nullability, revisited

A thrown error nulls the field it happened in, then bubbles through non-null parents (Module 6). So the **placement** of a check changes the response:

```compare
--- check in a field resolver (User.email)
{
  "data": {
    "issue": {
      "title": "Login page",
      "reporter": { "name": "Ada", "email": null }
    }
  }
}
// returned null instead of throwing —
// the rest of the page is fine
--- throw in a non-null field (reporter: User!)
{
  "data": { "issue": null },
  "errors": [{
    "message": "You are not allowed…",
    "path": ["issue", "reporter", "email"]
  }]
}
// email: String! threw, so the null bubbled
// up and took the whole issue with it
```

Field-level permissions should usually **return null**, not throw — that's why `email` is a nullable field that resolves to `null` for other users. Throw for operations (mutations, guarded root queries), where failing the whole thing is the right outcome.

## Mutations: fail cleanly

For a mutation, the useful contract is: **either it worked and you get the object, or it didn't and you get an error with a code** (and nothing was changed). That means validate and check permissions *before* writing:

```ts
updateIssue: async (_p, { id, input }, ctx) => {
  const user = requireUser(ctx);                  // 1. who? (UNAUTHENTICATED)
  const issue = await Issue.findById(id);
  if (!issue) throw notFound('Issue');             // 2. exists? (NOT_FOUND)
  await assertCanWriteProject(user, issue.project); // 3. allowed? (FORBIDDEN)
  return updateIssue(id, input);                   // 4. do it (validation → BAD_USER_INPUT via formatError)
},
```

The order matters: don't reveal that issue `X` exists (NOT_FOUND vs FORBIDDEN) before you know the caller is logged in, and don't write anything before every check passed.

```quiz
Q: A resolver throws `new Error('Cannot read properties of undefined (reading "role")')`. Without a custom formatError, what does the client see?
- [ ] "Internal server error"
- [x] The exact message, with code INTERNAL_SERVER_ERROR
- [ ] Nothing — the field is just null
> Apollo Server passes the message through. Mask unexpected errors in `formatError`, and log the original with enough context to debug it.
```

```quiz
Q: `formatError` checks `err.name === 'ValidationError'` to map Mongoose errors. What goes wrong?
- [x] Malformed queries (GraphQL validation errors) get mislabeled as BAD_USER_INPUT
- [ ] Nothing; only Mongoose uses that name
- [ ] Mongoose errors are never passed to formatError
> GraphQL's validation errors use the same `name`. Use `instanceof mongoose.Error.ValidationError`.
```
