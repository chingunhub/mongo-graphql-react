---
title: "Pending work is a recoverable state"
minutes: 24
---

Here's a shift in thinking that makes systems calmer. An outage isn't an emergency for your data if your data was never in danger.

Relaydesk already saves the ticket and its intent together. So if the queue is down, what's actually wrong? Some events are **pending**. That's a normal state with a normal exit. The dispatcher tries, reports what happened, and tries again later. Nobody has to run a script at 3 a.m.

## One rule per pending item

Here's a small version: a library sends overdue slips. Notice three decisions.

```ts
// @worked-example slip-run
export type Slip = { id: string; sent: boolean };

export async function sendAll(slips: Slip[], send: (slip: Slip) => Promise<void>) {
  let sent = 0;
  let failed = 0;
  for (const slip of slips.filter((candidate) => !candidate.sent)) {
    try {
      await send(slip);
      slip.sent = true;
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}
```

- The `sent` flag is only set **after** `send` finishes. You fixed that exact order in the last bug hunt.
- The `try` is **inside** the loop. One bad slip can't hide all the useful work behind it.
- A failure gets counted, so it's visible, and it stays pending, so the next run picks it up.

Run `sendAll` twice, with `send` failing for one slip the first time. You'll get `{ sent: 2, failed: 1 }`, then `{ sent: 1, failed: 0 }`. Recovery isn't a special code path. **It's the same function, run again.** That's the design to look for: a recovery path that only runs during incidents is a recovery path that's never been tested.

```viz-flow
{
  title: 'Every outcome leaves a safe state',
  colWidth: 195,
  rowHeight: 92,
  nodes: [
    { id: 'pending', label: 'Pending', sub: 'in the ticket', col: 0, row: 0, color: 'mongo' },
    { id: 'parse', label: 'Valid envelope?', sub: 'tenant + ticket match', col: 1, row: 0, color: 'gql' },
    { id: 'deliver', label: 'Effect committed?', sub: 'await the result', col: 2, row: 0, color: 'forge' },
    { id: 'ack', label: 'Acknowledged?', sub: 'matchedCount is 1', col: 3, row: 0, color: 'forge' },
    { id: 'done', label: 'Delivered', sub: 'stops being pending', col: 3, row: 1, color: 'forge' },
    { id: 'failed', label: 'Stays pending', sub: 'counted as failed', col: 1, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'pending', to: 'parse' },
    { from: 'parse', to: 'deliver' },
    { from: 'deliver', to: 'ack' },
    { from: 'ack', to: 'done' },
    { from: 'parse', to: 'failed', dashed: true },
    { from: 'deliver', to: 'failed', dashed: true },
    { from: 'ack', to: 'failed', dashed: true, label: 'repeat is safe' },
    { from: 'failed', to: 'pending', dashed: true, label: 'next run' },
  ],
  steps: [
    { focus: ['parse>failed', 'deliver>failed'], caption: 'Failing before the effect is easy. Nothing happened, and it stays pending.' },
    { focus: ['ack>failed'], caption: 'This is the uncomfortable one. The effect happened and we failed to record it, so the next run delivers again.' },
    { focus: ['failed>pending', 'pending'], caption: 'The receipt from Module 19 absorbs that repeat. That is why those two modules come in this order.' },
  ],
}
```

## What does "delivered" mean?

Be precise here, as there are two ways to deliver in the final project:

| Adapter | When its promise resolves | Safe to acknowledge? |
| --- | --- | --- |
| Local | the activity receipt is committed | yes |
| BullMQ `queue.add` alone | the job is **queued** | no, that only means "accepted" |
| BullMQ with `waitUntilFinished` | the worker finished the effect | yes |

Acknowledging right after `queue.add` would mean "we handed it to someone", and this course's `delivered` flag means the effect completed. Both designs are legitimate, as long as the flag says what it means. If it's fuzzy, nobody can tell you what's safe during an incident.

## Inject the failure at the uncomfortable point

Tests that fail before anything happens don't teach much. Here's the test that earns its keep:

```ts
await ingest(ctx, input);
// Stage the crash: the effect commits, then the acknowledgement fails.
const original = Ticket.updateOne;
Ticket.updateOne = () => { throw new Error('crash'); };
await dispatchPending(ctx, processOpening); // { delivered: 0, failed: 1 }
Ticket.updateOne = original;

await dispatchPending(ctx, processOpening); // { delivered: 1, failed: 0 }
await Activity.countDocuments();            // still 1
```

That's the crash window from the outbox lesson, as a test: one effect, two attempts, one receipt.

```quiz
Q: Delivery commits the activity, but the acknowledgement fails. What should the next dispatch do?
- [ ] Skip the event, because the HTTP response was already successful
- [x] Redeliver the same event, find the existing receipt, then acknowledge
- [ ] Create another event with a new ID
> The receipt and the stable identity make recovery safe. A missing acknowledgement is uncertainty about delivery, and not permission to invent a new event.
```

## An operations report isn't a transaction

The operations screen shows counts of tickets, pending events and activity receipts. They're separate reads, so while work is moving, they can reflect slightly different moments. That's fine for a diagnostic view. It wouldn't be fine as the only record of money.

And here's a tempting shortcut:

```ts
const pending = tickets - activities; // ✘
```

Don't do this. A different event type, a migration, or a duplicate would quietly break the arithmetic, and it'd look like a real number. Count the actual pending flag from the place where it lives.

```quiz
Q: Why does the dispatcher's try/catch go inside the loop, rather than around it?
- [x] So one failed event can't stop every event after it
- [ ] So the loop runs faster
- [ ] Because await doesn't work outside a try
> Around the loop, the first poison event would block all the others on every run. Inside it, the failure is counted and the rest get delivered.
```

## Writing it up

After something unexpected, write a short note. It's the habit that turns an investigation into something reviewable:

| Section | Question |
| --- | --- |
| Symptom | What did someone see? |
| Boundary | Where does the evidence place it? |
| Evidence | Which IDs, counts and logs? |
| Hypothesis | What do you think, and how could it be wrong? |
| Reproduction | What's the smallest way to see it? |
| Fix + test | What changed, and what stops it returning? |
| Unknowns | What's still uncertain? |

Don't write a confident root cause before you've reproduced it. "We don't know yet, here's what we've ruled out" is what experienced engineers actually say, and it's much more useful than a guess.

## What's next

The forge step builds the real dispatcher and report. `sendAll` gave you the skeleton, and yours adds tenants, envelopes and a filtered acknowledgement.
