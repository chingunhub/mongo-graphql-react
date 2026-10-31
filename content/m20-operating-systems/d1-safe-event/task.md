---
title: "Drill: useful logs without request dumps"
kind: "drill"
focus: ["event.ts"]
---

The lesson's `timed` trusted its caller's types. Yours can't: `input` might be anything, and it's about to be written somewhere that lasts. So you'll build the gate in front of a log.

## Your task

### `operationalEvent(input)` in `event.ts`

`input` is `unknown`. Return a **new** object with exactly these five keys:

| Field | Must be |
| --- | --- |
| `requestId`, `tenant`, `operation` | non-blank strings (spaces alone don't count) |
| `outcome` | `ok` or `error` |
| `durationMs` | a finite number, 0 or more |

Anything else throws `Error('Invalid operational event')`. Don't coerce values, and don't mutate the input.

Nothing extra may survive, however it's named:

```ts
operationalEvent({
  requestId: 'r1', tenant: 'north', operation: 'ingest', outcome: 'ok', durationMs: 4,
  token: 'secret', headers: { authorization: 'x' },
});
// { requestId: 'r1', tenant: 'north', operation: 'ingest', outcome: 'ok', durationMs: 4 }

operationalEvent({ requestId: 'r1', tenant: 'north', operation: 'ingest', outcome: 'ok', durationMs: NaN });
// throws Invalid operational event
```

## Hints

### Start from unknown
You can't read fields from `unknown`. What has to be true before reading a property is safe? `null` is a sneaky one.

### Building the result
What's the difference between deleting the keys you don't want, and writing out the keys you do?

### A blank string
Is `'   '` a useful request ID? How would you tell?
