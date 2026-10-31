---
title: "Taskforge: the User model"
kind: forge
workspace: taskforge
db: true
summary: The first file of your capstone codebase.
focus: [server/models/User.ts, playground.ts]
needs: [m01/l2-schema-model-document]
---

Welcome to the Taskforge codebase. Right now it's one file; by module 13 it'll be a full-stack app with ~30 files across a data layer, a GraphQL API and a React client — and **everything you write here carries forward**. When you open the next forge step, your `User.ts` will be in it, exactly as you left it.

Here's where this file sits in the final architecture:

```viz-flow
{
  colWidth: 170,
  rowHeight: 74,
  nodes: [
    { id: 'react', label: 'web/', sub: 'React + Apollo Client', col: 0, row: 0, color: 'react' },
    { id: 'gql', label: 'server/graphql/', sub: 'schema · resolvers', col: 1, row: 0, color: 'gql' },
    { id: 'repo', label: 'repositories/', sub: 'query building', col: 2, row: 0, color: 'mongo' },
    { id: 'models', label: 'server/models/', sub: 'User ← you are here', col: 3, row: 0, color: 'forge' },
  ],
  edges: [
    { from: 'react', to: 'gql', label: 'HTTP' },
    { from: 'gql', to: 'repo' },
    { from: 'repo', to: 'models' },
  ],
}
```

Users in Taskforge are people who report issues, get assigned to them and comment on them. For now they need a name, an email, and a role.

## Your task

In `server/models/User.ts`:

1. **Schema + model** exported as `User` (model name `'User'`):

   | Field | Rules |
   | --- | --- |
   | `name` | string, required, trimmed |
   | `email` | string, required, trimmed **and** lowercased |
   | `role` | string, one of `'MEMBER'` or `'ADMIN'`, defaults to `'MEMBER'` |

   plus `createdAt`/`updatedAt` timestamps.

   Also export the allowed roles as `ROLES` (an array: `['MEMBER', 'ADMIN']`) so other files never hard-code them.

2. **`createUser({ name, email, role? })`** — creates and returns the user.

3. **`findUserByEmail(email)`** — returns the user or `null`. It must find `ada@taskforge.dev` when called with `"  Ada@Taskforge.DEV "` — people type emails however they like on login forms.

4. **`listUsers()`** — all users sorted by name A→Z.

The role rule is something the lesson didn't show: a string that must be one of a fixed set of values. Mongoose has an option for exactly that — look at how `ROLES` could plug into the schema.

> [!TIP]
> Think about *where* the email normalization should live. You could lowercase inside `findUserByEmail`… or you could let the schema do it for both writes **and** queries. One of those still works when a teammate writes `User.findOne({ email })` somewhere else in the codebase.

## Hints

### Restricting a string to a set of values
String fields accept an `enum` option: an array of allowed values. Anything else fails validation with a `ValidationError` mentioning the path. You can pass your exported `ROLES` array directly.

### Case-insensitive lookup
Remember from the lesson: setters like `lowercase` and `trim` run on **query filters** too. If the schema normalizes `email`, then `User.findOne({ email })` already searches for the normalized value.

### Sorting
`User.find().sort({ name: 1 })` — and `find()` with no filter returns everything.
