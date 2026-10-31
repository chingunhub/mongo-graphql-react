---
title: "Bug hunt: the disappearing event"
kind: "bughunt"
focus: ["dispatch.ts"]
---

The on-call note says:

> The delivery service was down for ten minutes last night. It's back, and there were no errors after that, but events from those ten minutes never arrived. They're marked as delivered. Nothing is pending, so nothing retried.

## Your task

Fix `dispatch(event, deliver, acknowledge)` in `dispatch.ts`.

| What happens | Expected behavior |
| --- | --- |
| `deliver` resolves, `acknowledge` resolves | returns the delivery result |
| `deliver` rejects | **no** acknowledgement, the same rejection escapes |
| `deliver` resolves, `acknowledge` rejects | the rejection escapes |

Don't catch errors and return success. The last row looks strange: delivery worked, so why fail? Because the system can't prove it was recorded, recovery may deliver the same stable event again. The next forge step makes that repeat safe.

Before Submit, write down what "acknowledged" should mean, in one sentence. If your sentence has the word "attempted" in it, look again.

## Hints

### What does the note tell you?
"Marked as delivered" while the service was down. Which line ran, and which never finished?

### Awaiting matters
There's a tempting fix that only swaps two lines but leaves a promise floating. What happens if the acknowledgement runs before delivery has finished?

### Result order
The function returns the delivery result, but only once something else has finished. Where does that value have to wait?
