---
title: 'Drill: the guards, and one that really checks'
kind: drill
focus: ['permissions.ts']
---

You'll see `moduleRequireLogin(queries)` at the bottom of files all over erxes. The pattern is worth building once, because it changes how you read those files. And you'll fix two things about the original on the way: your `checkPermission` actually checks, and a falsy default value works.

These guards replace methods **in place**, on the object you pass. That's why erxes can call them on their own line, after the object is defined.

## Your task

Implement everything in `permissions.ts`. Context always has the shape `{ user?: User }`.

### 1. The decisions

| Function | Behavior |
| --- | --- |
| `checkLogin(user)` | Throws `Login required` unless the user has a non-empty `_id` |
| `can(action, user)` | `false` when logged out, by the same rule as `checkLogin`. `true` if `isOwner` is exactly `true`. Otherwise, whether `actions` includes it |

### 2. The wrappers

| Function | Behavior |
| --- | --- |
| `permissionWrapper(cls, methodName, checkers)` | Replaces the method with an async one that calls each checker with `context.user`, in order, then the original with all four arguments |
| `requireLogin(cls, methodName)` | Wraps with `checkLogin` |
| `moduleRequireLogin(mdl)` | Requires login on every method of the object |

### 3. Permissions

`checkPermission(cls, methodName, action, defaultValue?)` replaces a method so that:

1. A logged-out caller gets `Login required`, whatever the default.
2. A caller without the action gets `defaultValue` if one was provided, and otherwise `Permission required`.
3. An allowed caller reaches the original.

`moduleCheckPermission(mdl, action, defaultValue?)` applies that to every method.

```ts
const queries = { ticketCount: () => 12 };
moduleCheckPermission(queries, 'tickets:read', 0);

await queries.ticketCount(null, {}, { user: { _id: 'a', actions: [] } }, null); // 0
await queries.ticketCount(null, {}, {}, null); // rejects: Login required
```

## Hints

### Replacing a method safely
What happens if your new function calls `cls[methodName]`? Which value should it hold on to, and when?

### A default of zero
A permission fallback can be `0`, `false` or `''`. What check tells "not provided" apart from those?

### Wrapping a whole object
You need every key the object has. What's a loop that gives each wrapper its own method?
