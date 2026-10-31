---
title: "Taskforge: sign up, log in, guard the API"
kind: forge
workspace: taskforge
db: true
summary: Tokens in, users out — then authorization at the operation, object and field level, and a real error layer.
focus: [server/graphql/context.ts, server/graphql/errors.ts, server/services/permissions.ts, server/graphql/resolvers/user.ts, server/graphql/resolvers/issue.ts, playground.ts]
readonly: [server/auth/tokens.ts]
needs: [m08/l1-context-auth, m08/l2-errors]
---

Right now anyone can do anything to Taskforge, and every request is "whoever the test says". This step makes the API real: users sign up and log in, the server knows who's calling from the `Authorization` header, and the rules below are enforced **in one place each**.

```viz-flow
{
  colWidth: 185,
  rowHeight: 72,
  nodes: [
    { id: 'hdr', label: 'Authorization header', col: 0, row: 0, color: 'neutral', w: 170 },
    { id: 'ctx', label: 'context.ts', sub: 'token → currentUser', col: 1, row: 0, color: 'forge' },
    { id: 'res', label: 'resolvers', sub: 'requireUser(ctx)', col: 2, row: 0, color: 'gql' },
    { id: 'perm', label: 'services/permissions', sub: 'assertCanWriteProject', col: 2, row: 1, color: 'forge', w: 175 },
    { id: 'err', label: 'errors.ts', sub: 'codes + formatError', col: 1, row: 1, color: 'forge' },
  ],
  edges: [
    { from: 'hdr', to: 'ctx' }, { from: 'ctx', to: 'res' }, { from: 'res', to: 'perm' }, { from: 'res', to: 'err', dashed: true }, { from: 'perm', to: 'err', dashed: true },
  ],
}
```

The token helpers are provided in `server/auth/tokens.ts`: `signToken(userId)` and `verifyToken(token)` (read it — it's short, and it's the same idea as a JWT).

## Your task

### 1. `server/graphql/context.ts` — `buildContext({ req })`
`Authorization: Bearer <token>` (scheme case-insensitive) with a valid token → `{ currentUser: <User document> }`. Missing/invalid/expired token, or a user that no longer exists → `{ currentUser: null }`. Never throws.

### 2. `server/graphql/errors.ts`
- `badInput(message, fields?)`, `unauthenticated(message?)`, `forbidden(message?)`, `notFound(what)` — `GraphQLError`s with codes `BAD_USER_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`.
- `requireUser(ctx)` — the current user, or throw `UNAUTHENTICATED`.
- `formatError(formatted, error)`:
  - Mongoose `ValidationError` → `BAD_USER_INPUT`, message `Invalid input`, `extensions.fields` = `{ path: message }`
  - Mongoose `CastError` → `BAD_USER_INPUT`
  - duplicate key (`code === 11000`) → `BAD_USER_INPUT`, with `extensions.fields` naming the duplicated field (e.g. `{ email: '…' }`)
  - `INTERNAL_SERVER_ERROR` → message `Internal server error`, nothing else leaked
  - everything else unchanged

Then pass `formatError` to the `ApolloServer` in `server.ts`.

### 3. `server/services/permissions.ts`
- `canWriteProject(user, project)` — true for admins, the owner, and members.
- `assertCanWriteProject(user, projectId)` — loads the project; `NOT_FOUND` if missing, `FORBIDDEN` if not allowed; returns the project.

### 4. Resolvers

**`user.ts`**
- `signUp(input)` → `{ token, user }`. A short password or a taken email must come back as `BAD_USER_INPUT` (your model + `formatError` already do the work — don't re-validate by hand).
- `login(email, password)` → `{ token, user }`, or `UNAUTHENTICATED` with the message `Invalid email or password` — the **same** message whether the email exists or not.
- `User.email` → the email **only** for the user themselves or an admin; `null` for everyone else (including anonymous).

**Every mutation** requires a logged-in user (`UNAUTHENTICATED` otherwise). Queries stay public.

**Project rules** — `createProject`: any logged-in user. `addMember`: only the project's **owner** or an admin (`FORBIDDEN` otherwise); unknown project → `NOT_FOUND`.

**Issue rules** — `createIssue`, `updateIssue`, `addLabel`, `removeLabel`, `addComment`: the user must be able to write to the issue's project (`assertCanWriteProject`). `deleteIssue`: additionally, only the issue's **reporter**, the project **owner**, or an admin. Check in this order: logged in → issue exists → allowed.

Keep the **reporter/author/owner from `currentUser`** — never from input.

## Hints

### The header
`String(req.headers.authorization ?? '').trim().split(/\s+/)` → `[scheme, token]`. Then `verifyToken(token)` → `{ userId }` or `null`, then `User.findById(userId)`.

### One helper for "writable issue"
In `issue.ts`, a small `loadWritableIssue(ctx, id)` that does requireUser → findById (NOT_FOUND) → assertCanWriteProject, used by update/delete/addLabel/removeLabel, keeps every mutation consistent. Copy-pasted checks drift apart.

### formatError
`unwrapResolverError(error)` from `@apollo/server/errors` gives you the original. Check `instanceof mongoose.Error.ValidationError` / `instanceof mongoose.Error.CastError`, then `original.code === 11000` (the field is `Object.keys(original.keyValue)[0]`).
