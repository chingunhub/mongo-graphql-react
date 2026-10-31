---
title: "Relaydesk: establish request identity"
kind: "forge"
workspace: "relaydesk"
summary: "Select a tenant membership and enforce per-action permissions."
focus: ["packages/contracts/context.ts"]
---

Every Relaydesk service from now on starts from the same object: a context that says who's asking, in which organization, and under which request ID. You'll write that object and the rule that guards it. If this step is sloppy, every later step inherits the hole.

```viz-flow
{
  title: 'Each failure has one name',
  colWidth: 190,
  rowHeight: 90,
  nodes: [
    { id: 'p', label: 'principal?', sub: 'null means nobody', col: 0, row: 0, color: 'gql' },
    { id: 'm', label: 'membership here?', sub: 'own key of memberships', col: 1, row: 0, color: 'gql' },
    { id: 'r', label: 'requestId?', sub: 'not blank', col: 2, row: 0, color: 'gql' },
    { id: 'ok', label: 'Context', sub: 'tenant · actorId · role · requestId', col: 3, row: 0, color: 'forge' },
    { id: 'e1', label: 'UNAUTHENTICATED', col: 0, row: 1, color: 'neutral' },
    { id: 'e2', label: 'FORBIDDEN', col: 1, row: 1, color: 'neutral' },
    { id: 'e3', label: 'BAD_REQUEST', col: 2, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'p', to: 'm' }, { from: 'm', to: 'r' }, { from: 'r', to: 'ok' },
    { from: 'p', to: 'e1', dashed: true }, { from: 'm', to: 'e2', dashed: true }, { from: 'r', to: 'e3', dashed: true },
  ],
}
```

## Your task

### 1. `buildContext(principal, tenant, requestId)`

`principal` has already been verified by a credential adapter, or it's `null`. Check it in this order:

| Situation | Throw an Error with message |
| --- | --- |
| `principal` is null | `UNAUTHENTICATED` |
| no **own** membership for `tenant` | `FORBIDDEN` |
| membership holds an unknown role | `FORBIDDEN` |
| `requestId` is empty or only whitespace | `BAD_REQUEST` |

On success return exactly `{ tenant, actorId: principal.id, role, requestId }`, with no extra fields. Don't mutate the principal.

### 2. `requireAction(context, action)`

Returns nothing when allowed, and throws `FORBIDDEN` otherwise, including for an unknown role or action at runtime.

| Role | `tickets:read` | `tickets:triage` | `plugins:manage` |
| --- | --- | --- | --- |
| reader | ✔ | | |
| agent | ✔ | ✔ | |
| admin | ✔ | ✔ | ✔ |

```ts
const mia = { id: 'mia', memberships: { north: 'admin', south: 'reader' } };

const ctx = buildContext(mia, 'south', 'r-1');
// { tenant: 'south', actorId: 'mia', role: 'reader', requestId: 'r-1' }

requireAction(ctx, 'tickets:triage'); // throws FORBIDDEN, she's only a reader here
buildContext(mia, 'constructor', 'r-2'); // throws FORBIDDEN
```

> [!TIP]
> TypeScript says `role` is one of three strings, but this data arrives at runtime. The tests send roles and actions the type wouldn't allow.

## Hints

### One step at a time
Your code can follow the diagram from left to right. Each check ends the function or lets it continue.

### That constructor example
You saw the trap in the lesson. Which call checks only an object's own keys? Think about where else a string from outside is used as a key.

### Deny by default
Try describing what each role *can* do, as data, rather than writing `if` statements about what each can't. What happens to an unknown role with that design?
