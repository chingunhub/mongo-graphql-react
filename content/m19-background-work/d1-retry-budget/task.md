---
title: "Drill: a bounded retry decision"
kind: "drill"
focus: ["retry.ts"]
---

Behind every retry setting is a small decision. This drill pulls it out into one pure function, with no queue and no timers, so you can test the policy in isolation. If you played with the lab, you've already seen these numbers.

## Your task

### `retryPlan(input)` in `retry.ts`

`input` is `{ attemptsMade, maxAttempts, baseDelay, maxDelay, kind }`. `attemptsMade` **includes the attempt that just failed**. Return `{ delayMs }`, or `null` for "stop".

```ts
const policy = { maxAttempts: 4, baseDelay: 100, maxDelay: 1000, kind: 'transient' };

retryPlan({ ...policy, attemptsMade: 1 }); // { delayMs: 100 }
retryPlan({ ...policy, attemptsMade: 2 }); // { delayMs: 200 }
retryPlan({ ...policy, attemptsMade: 3 }); // { delayMs: 400 }
retryPlan({ ...policy, attemptsMade: 4 }); // null, the budget is spent

retryPlan({ ...policy, attemptsMade: 3, maxDelay: 300 }); // { delayMs: 300 }, capped
retryPlan({ ...policy, attemptsMade: 1, kind: 'permanent' }); // null
```

### Reject bad configuration

Throw `Error('Invalid retry policy')` unless all of these hold, and check this **before** deciding to return `null`:

- `attemptsMade` and `maxAttempts` are positive integers.
- `baseDelay` and `maxDelay` are finite positive numbers.
- `maxDelay` is at least `baseDelay`.
- `kind` is `transient` or `permanent`.

Don't sleep or schedule anything here. This function only decides.

## Hints

### Find the exponent
Look at the examples. After attempt 1 the multiplier is 1, after attempt 2 it's 2. Write out what power of 2 that is.

### Why validate first?
With a broken policy and a permanent failure, returning `null` would hide a configuration bug. Which call in the examples would mask it?

### NaN is a number
`typeof NaN` is `'number'`. Which built-in checks both "is a number" and "isn't infinite"?
