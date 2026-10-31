---
title: "Drill: load plugins independently"
kind: "drill"
focus: ["plugins.ts"]
---

`loadOne` handled a failed download. Real hosts have a sneakier failure too: a module that downloads fine, but was built for an older version of the host. It "works" right up until it crashes somewhere strange. So check its contract before calling it ready.

## Your task

### `loadPlugins(names, importPlugin)` in `plugins.ts`

Call `importPlugin(name)` once for each name, **concurrently**. The names are unique. Return one outcome per name, in input order.

A module is valid if `version` is exactly `1` and `title` is a string that isn't blank.

| What happened | Outcome |
| --- | --- |
| Valid module | `{ name, status: 'ready', title }` |
| The import rejected | `{ name, status: 'failed', reason: 'load failed' }` |
| It loaded, but the contract is wrong | `{ name, status: 'failed', reason: 'incompatible plugin' }` |

```ts
await loadPlugins(['tickets', 'sales', 'old'], async (name) => {
  if (name === 'sales') throw new Error('ECONNRESET at 10.0.0.4');
  return name === 'old' ? { version: 0, title: 'Old' } : { version: 1, title: 'Tickets' };
});
// [
//   { name: 'tickets', status: 'ready', title: 'Tickets' },
//   { name: 'sales', status: 'failed', reason: 'load failed' },
//   { name: 'old', status: 'failed', reason: 'incompatible plugin' },
// ]
```

Notice that the exception text doesn't appear anywhere. It can reveal internal details, so it stays out of the outcome. One failure must not lose its siblings, and empty input returns `[]`.

## Hints

### Concurrent, not sequential
If you `await` inside a `for` loop, how long does one slow plugin hold up the rest? A test will time this.

### Two failure reasons
A single `try` around everything can't tell the two failures apart. Where does the import failure end, and the contract check begin?

### What might a module be?
It came from outside your program. Could it be `null`? Could it be a string? Check before you read properties from it.
