---
title: "Relaydesk: validate the plugin registry"
kind: "forge"
workspace: "relaydesk"
summary: "Start a separate cumulative support system with explicit plugin dependencies."
focus: ["packages/contracts/plugins.ts"]
---

Welcome to Relaydesk! This is a brand-new workspace, and nothing from Taskforge comes along. By Module 23 it'll have contacts, tickets, background activity and a console. Every step builds on this one, just like Taskforge did.

The first job is boring on purpose. A plugin system that boots in the wrong order fails in strange ways, far from the cause. So we'll refuse to start at all if the plugin list makes no sense.

```viz-tree
{
  title: 'Depth-first order for a diamond',
  root: { id: 'console', label: 'console', value: 'requires activity, tickets', color: 'react', children: [
    { id: 'activity', label: 'activity', value: 'requires tickets', color: 'forge', children: [
      { id: 't1', label: 'tickets', value: 'requires contacts', color: 'gql', children: [
        { id: 'c1', label: 'contacts', value: 'no requirements', color: 'mongo' },
      ] },
    ] },
    { id: 't2', label: 'tickets', value: 'already finished, skip', color: 'neutral' },
  ] },
  steps: [
    { focus: ['console'], caption: 'Start at console. Before it can be added, everything it requires must be finished.' },
    { focus: ['c1'], caption: 'Walking down: contacts needs nothing, so it is added first.' },
    { focus: ['t1'], caption: 'Back up: tickets is added next, and activity after it.' },
    { focus: ['t2'], caption: 'console also requires tickets. It is finished already, so sharing it is fine and it is not added twice.' },
    { focus: ['console'], caption: 'Finally console. Result: contacts, tickets, activity, console.' },
  ],
}
```

## Your task

### 1. `orderPlugins` in `packages/contracts/plugins.ts`

`orderPlugins(plugins: Plugin[]): string[]` returns plugin names in the order they should start. Dependencies come before the plugins that need them, and each plugin appears once.

```ts
orderPlugins([
  { name: 'console', version: 1, requires: ['tickets', 'activity'] },
  { name: 'tickets', version: 1, requires: ['contacts'] },
  { name: 'activity', version: 1, requires: ['tickets'] },
  { name: 'contacts', version: 1, requires: [] },
]);
// ['contacts', 'tickets', 'activity', 'console']
```

### 2. Make the order predictable

Several valid orders can exist, so we'll pin one down: visit top-level plugins **alphabetically**, and go through each `requires` list **alphabetically**, depth-first. The same input should always boot the same way, and the tests check that.

### 3. Refuse a bad registry

| Problem | Throw an Error containing |
| --- | --- |
| Two plugins share a name | `Duplicate plugin` |
| `version` isn't 1 | `Unsupported version` |
| `requires` names a plugin that isn't listed | `Missing dependency` |
| Plugins depend on each other in a loop | `Dependency cycle` |

Don't mutate the input. Sorting in place would quietly reorder someone's `requires` array.

> [!TIP]
> The lesson's `bootOrder` is a great starting point, but its single `done` set couldn't tell a diamond from a cycle. You'll need something more.

## Hints

### Why bootOrder isn't enough
`bootOrder` returned a wrong answer for a cycle. What did it fail to know at the moment it saw `a` for the second time?

### Two kinds of "seen"
A node can be finished, or it can be in progress, on the current path of the walk. Reaching a finished node is normal sharing. Reaching an in-progress node means what?

### Set up before you walk
Duplicates and bad versions don't need a traversal at all. A quick pass over the list can build a lookup by name and reject those first.

### Sorting without mutating
`.sort()` changes the array it's called on. How do you get a sorted copy?
