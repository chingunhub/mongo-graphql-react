---
title: "Drill: a guarded notes API"
kind: drill
db: true
summary: A context function, operation- and object-level authorization, and a formatError that maps and masks.
focus: [context.ts, errors.ts, resolvers.ts, schema.ts, playground.ts]
readonly: [schema.ts, models/User.ts, models/Note.ts]
needs: [m08/l1-context-auth, m08/l2-errors]
---

A notes app: everyone has private notes; a note can be marked `shared`, which makes it readable (not editable) by anyone. Clients authenticate with an **API key** header — not a Bearer token like the lesson:

```text
Authorization: ApiKey 9f1c2d…
```

The models and the schema are provided (read `schema.ts` first). You write the context, the errors module and the resolvers.

## Your task

### `context.ts` — `buildContext({ req })`
Resolves to `{ currentUser }`. Read the `authorization` header; if it's `ApiKey <key>` (the scheme is **case-insensitive**: `apikey`, `APIKEY` are fine) and a user has that `apiKey`, that's the current user. Anything else — no header, wrong scheme, unknown key — means `currentUser: null`. **Never throw** from the context: anonymous requests must still be able to read shared notes.

### `errors.ts`
- Helpers `unauthenticated()`, `forbidden()`, `notFound(what)`, each a `GraphQLError` with the matching `extensions.code` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`).
- `formatError(formatted, error)`:
  - a Mongoose `ValidationError` → `{ message: 'Invalid input', extensions: { code: 'BAD_USER_INPUT', fields: { path: message, … } } }`
  - anything whose code is `INTERNAL_SERVER_ERROR` → `{ message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }` — never the original message
  - everything else unchanged.

### `resolvers.ts`

| Field | Rules |
| --- | --- |
| `myNotes` | logged in only (`UNAUTHENTICATED` otherwise); my notes, newest first |
| `note(id)` | anyone; returns the note if it's **shared or mine**, otherwise `null` (also `null` for unknown/malformed ids) |
| `createNote(input)` | logged in only; I'm the owner. Invalid input surfaces as `BAD_USER_INPUT` with `fields` (through your `formatError`) |
| `updateNote(id, input)` / `deleteNote(id)` | logged in only. Note I can't see at all → `NOT_FOUND`. Note I can see but don't own (someone else's shared note) → `FORBIDDEN`. `deleteNote` returns the id |
| `Note.id`, `Note.owner`, `Note.createdAt` (ISO) | |

### `server.ts`
`createServer()` must pass your `formatError` to `ApolloServer`.

## Hints

### Parsing the header
`const [scheme, key] = (req.headers.authorization ?? '').split(' ')`. Compare `scheme?.toLowerCase() === 'apikey'`. Only query the database when there's a key.

### One visibility function
Write `canSee(note, user)` once (shared, or owner equals user) and use it in `note`, `updateNote` and `deleteNote`. For update/delete: load → not found or `!canSee` → `notFound('Note')` → not owner → `forbidden()`.

### formatError
`unwrapResolverError(error)` (from `@apollo/server/errors`) gives you what the resolver threw. Check `instanceof mongoose.Error.ValidationError`, then `formatted.extensions?.code === 'INTERNAL_SERVER_ERROR'`.
