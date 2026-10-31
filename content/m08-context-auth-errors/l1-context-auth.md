---
title: Context, authentication and authorization
minutes: 18
---

So far your resolvers trusted a `currentUser` that the tests handed them. In a real server, that value has to come from the HTTP request, be verified, and then be used to decide what each caller may do. Three separate concerns, often blurred together:

| | Question | Where it happens |
| --- | --- | --- |
| **Context** | What does every resolver in *this request* need? | context function, once per request |
| **Authentication** (authn) | *Who* is calling? | context function: token → user |
| **Authorization** (authz) | *May* they do this? | resolvers / services / field resolvers |

> [!BRIDGE]
> In Express you'd write an auth middleware that reads the token, sets `req.user` and calls `next()`. The context function is that middleware's first half: it runs once per request, before your handlers, and `req.user` becomes `context.currentUser`. The second half moves. A missing token usually doesn't end the request here, because some fields are public, so each resolver that needs a user does its own refusing.

## Context: one object per request

Apollo Server calls your **context function** at the start of every request. Whatever it returns becomes the third argument to every resolver in that request:

```ts
const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => ({
    currentUser: await userFromRequest(req),
    requestId: crypto.randomUUID(),
  }),
});
```

```viz-sequence
{
  actors: [
    { id: 'c', label: 'client', color: 'react' },
    { id: 's', label: 'Apollo Server', color: 'gql' },
    { id: 'ctx', label: 'context()', color: 'forge' },
    { id: 'r', label: 'resolvers', color: 'gql' },
  ],
  steps: [
    { from: 'c', to: 's', label: 'POST /graphql + Authorization header', note: 'Request A arrives.' },
    { from: 's', to: 'ctx', label: 'context({ req })', note: 'Called **once per request**, before execution.' },
    { from: 'ctx', to: 's', label: '{ currentUser, … }', ret: true, note: 'A fresh object. Request B, arriving at the same time, gets its **own** context — that\'s what keeps users\' data apart.' },
    { from: 's', to: 'r', label: 'resolver(parent, args, ctx)', note: 'Every resolver in this request receives the same `ctx` object.' },
    { from: 'r', to: 's', label: 'values', ret: true },
    { from: 's', to: 'c', label: '{ data, errors }', ret: true, note: 'Request done — the context is garbage. Nothing in it survives to the next request.' },
  ],
}
```

That last point is a rule: **anything per-user or per-request goes in the context, never in a module-level variable.** A module-level `let currentUser` works perfectly in development with one user and leaks one user's data to another under load. (You'll put DataLoaders in the context in Module 9 for exactly this reason.)

## Authentication with tokens

A common setup — and the one Taskforge uses:

```viz-sequence
{
  actors: [
    { id: 'c', label: 'client', color: 'react' },
    { id: 's', label: 'server', color: 'gql' },
    { id: 'db', label: 'users', color: 'mongo' },
  ],
  steps: [
    { from: 'c', to: 's', label: 'mutation login(email, password)', note: 'The only time the password travels.' },
    { from: 's', to: 'db', label: 'findByCredentials', note: 'Hash comparison — your module 5 code.' },
    { from: 's', to: 'c', label: '{ token, user }', ret: true, note: 'The server **signs** a token containing the user id and an expiry. Only the server knows the signing secret.' },
    { from: 'c', to: 's', label: 'Authorization: Bearer <token>', note: 'Every later request carries the token in a header.' },
    { from: 's', to: 's', label: 'verify signature + expiry', note: 'The context function checks the signature (was this token made by us, unmodified?) and the expiry.' },
    { from: 's', to: 'db', label: 'User.findById(token.sub)', note: 'Load the *current* user — they might have been deleted or demoted since the token was issued.' },
    { from: 's', to: 's', label: 'ctx.currentUser = user', note: 'Now resolvers know who\'s calling.' },
  ],
}
```

What a signed token looks like:

```text
eyJzdWIiOiI2NmYxYzJhOSIsImV4cCI6MTc5MjAwMDAwMH0.k3l2…signature
└──────────── payload (base64url JSON) ──────────┘ └── HMAC ──┘
```

Two things people get wrong:

- **Signed is not encrypted.** Anyone can base64-decode the payload and read it. Never put secrets in a token. It's tamper-*proof*, not secret.
- **Verify on every request.** A token is only meaningful if the signature checks out *and* it hasn't expired. If verification fails, treat the caller as anonymous (`currentUser: null`) — don't throw in the context function, because public queries should still work.

(JWT is a standard format for exactly this; Taskforge uses a tiny HMAC token helper you can read in one sitting. In a browser app, an HttpOnly cookie is often a safer *transport* than a header the JS can read — but the verification logic is the same.)

> [!CAUTION]
> Never take identity from the client's input. `createIssue(input: { reporterId: "…" })` lets anyone file issues as anyone. Who's calling comes from the **verified token in the context** — full stop. That's why your `createIssue` already used `ctx.currentUser`.

## Authorization: where should the checks live?

Three levels, from coarse to fine:

```viz-flow
{
  colWidth: 210,
  rowHeight: 78,
  nodes: [
    { id: 'op', label: 'Operation-level', sub: 'must be logged in', col: 0, row: 0, color: 'gql' },
    { id: 'obj', label: 'Object-level', sub: 'may edit THIS issue?', col: 1, row: 0, color: 'gql' },
    { id: 'field', label: 'Field-level', sub: 'may see THIS field?', col: 2, row: 0, color: 'gql' },
    { id: 'op2', label: 'requireUser(ctx)', col: 0, row: 1, color: 'neutral' },
    { id: 'obj2', label: 'assertCanEdit(user, issue)', sub: 'services/permissions', col: 1, row: 1, color: 'neutral', w: 190 },
    { id: 'field2', label: 'User.email resolver', sub: 'null unless self/admin', col: 2, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'op', to: 'op2', dashed: true }, { from: 'obj', to: 'obj2', dashed: true }, { from: 'field', to: 'field2', dashed: true },
  ],
}
```

**Operation-level** — "only logged-in users can create issues". A one-line guard at the top of the resolver:

```ts
export function requireUser(ctx: Context) {
  if (!ctx.currentUser) throw new GraphQLError('You must be logged in', { extensions: { code: 'UNAUTHENTICATED' } });
  return ctx.currentUser;
}
```

**Object-level** — "only project members can edit its issues". This needs the *object* (which project is this issue in? who are its members?), and the same rule applies to several mutations. Put it in **one function in a permissions/service module**, not copy-pasted into five resolvers:

```ts title="services/permissions.ts"
export function canWriteProject(user, project) {
  return user.role === 'ADMIN'
    || String(project.owner) === String(user._id)
    || project.members.some((m) => String(m) === String(user._id));
}
```

When the rule changes ("…and contractors can't delete"), there's one place to change it. That's a *huge* deal in a big codebase — scattered authorization checks are where security bugs live, because someone always forgets one copy.

**Field-level** — "a user's email is visible only to themselves and admins". The field resolver itself decides:

```ts
User: {
  email: (user, _args, ctx) =>
    ctx.currentUser && (ctx.currentUser.role === 'ADMIN' || String(ctx.currentUser._id) === String(user._id))
      ? user.email
      : null,
},
```

This is why `email` is nullable in your schema: the field exists for everyone, but its *value* depends on who's asking. Field-level checks are the only way to protect a field **no matter which query path reaches it** — `me { email }`, `issue { reporter { email } }`, `project { members { email } }`… every path ends in that one resolver.

### FORBIDDEN or NOT_FOUND?

If a user may not see a private project, do you say "forbidden" or "not found"? "Forbidden" confirms it *exists* — sometimes that's a leak (think: private repository names). A common policy: **NOT_FOUND for things they can't see at all, FORBIDDEN for things they can see but not change.** Pick a policy and apply it consistently.

```quiz
Q: Why must the current user live in the context, not in a module-level variable set by the context function?
- [ ] Module variables are slower
- [x] Concurrent requests would overwrite each other's user — one person could act as another
- [ ] Apollo Server forbids module variables
> Node handles many requests concurrently in one process. A module-level variable is shared by all of them; the context object is created per request.
```

```quiz
Q: A token's payload is `{"sub":"66f1…","exp":1792000000}`, base64url-encoded, plus an HMAC signature. What can an attacker who intercepts it do?
- [ ] Nothing — it's encrypted
- [ ] Change `sub` to another user's id and reuse it
- [x] Read the payload, and replay the token until it expires — but not modify it
> Signed ≠ encrypted: the payload is readable. Modifying it breaks the signature. Replay is why tokens expire and why transport (HTTPS, HttpOnly cookies) matters.
```
