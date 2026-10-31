---
title: "Drill: one seat, two claimants"
kind: "drill"
db: true
focus: ["claim.ts"]
readonly: ["model.ts"]
---

The lesson's `borrow` had one condition. A seat has two: it must be available, and the caller must have seen its current version. Let's sell this seat exactly once.

## Your task

### `claimSeat(id, expectedVersion)` in `claim.ts`

The `Seat` model in `model.ts` has `status` (`available` or `reserved`) and `version`.

Return `true` only when **this call** changes an available seat at `expectedVersion` to `reserved` and raises `version` by 1, in one atomic operation. Everything else returns `false`:

| Situation | Result |
| --- | --- |
| Seat is available at the expected version | `true`, status reserved, version + 1 |
| Seat is already reserved | `false` |
| `expectedVersion` is stale | `false` |
| A valid ID that doesn't exist | `false` |

```ts
const seat = await Seat.create({});        // version 0
await claimSeat(String(seat._id), 0);      // true
await claimSeat(String(seat._id), 0);      // false, version is 1 now and it's reserved
```

Don't read and then save. The tests race eight callers at once. Before you press Submit, say the number of winners out loud.

## Hints

### Where does the condition go?
The lesson's `compare` showed it. Now list every field that must be true at the instant of the write.

### Two changes, one call
One update can use more than one operator. Which one sets a value, and which adds to it?

### Telling the caller
Your update returns a result object. Which field tells you whether your guard matched?
