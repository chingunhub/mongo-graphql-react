---
title: 'Enqueued is not delivered'
minutes: 26
---

You print a shipping label. You hand the parcel to a carrier. Days later, someone signs for it.

Those are three different events, and only the last means your friend has the parcel. A queue's `add` promise is much closer to the label than the signature, and this module's first job is to stop confusing them.

Your dispatcher acknowledges pending work when its delivery promise resolves. So everything depends on what that promise *means*. If the adapter resolves when Redis accepts a job, then the dispatcher erases pending work before anything has happened.

## Follow one promise to its meaning

```viz-sequence
{title:'Two promises, two meanings',actors:[{id:'dispatcher',label:'Dispatcher',color:'gql'},{id:'queue',label:'Queue + events',color:'neutral'},{id:'worker',label:'Worker',color:'mongo'}],steps:[
{from:'dispatcher',to:'queue',label:'enqueue event',note:'The intent stays pending while delivery is uncertain.'},
{from:'queue',to:'dispatcher',label:'job accepted',ret:true,note:'This is the **label**. A worker may not have started, or even exist.'},
{from:'queue',to:'worker',label:'process event',note:'The worker inserts or finds the durable activity receipt.'},
{from:'worker',to:'queue',label:'completed result',ret:true,note:'QueueEvents makes this completion visible to the producer.'},
{from:'queue',to:'dispatcher',label:'delivery promise resolves',ret:true,note:'This is the **signature**. Only now may the dispatcher acknowledge.'}
]}
```

BullMQ connects those two moments for you:

```ts
const events = new QueueEvents('opening', { connection });
await events.waitUntilReady();

const job = await queue.add('ticket.opened', event, options); // the label
const result = await job.waitUntilFinished(events, 8000);     // the signature
```

If the worker throws out of its attempts, `waitUntilFinished` rejects with that failure. And if `QueueEvents` isn't listening yet when the job finishes, you could wait for an event that already went past. That's why it's created and readied **before** you start adding jobs.

What does a timeout mean here? You've met this before. It means *you stopped watching*. The worker might finish a moment later.

```quiz
Q: A producer times out waiting for a job, and the worker completes a moment later. What must a retry tolerate?
- [x] The effect may already exist
- [ ] The timeout guarantees the worker was cancelled
- [ ] Redis must be emptied before retrying
> A timeout describes the observer's wait, not the work. This is why the durable receipt from Module 19 had to exist first.
```

## You own what you open

The adapter owns a Redis connection, a Queue, a QueueEvents and a Worker. That's four resources, and the constructors return before any of them is ready. So there are two jobs: wait until they're all usable, and don't leak any if something goes wrong along the way.

Suppose the Worker fails to start. The other three are open. A failed `start` that leaves connections behind keeps your process alive, holding handles that nobody can reach.

The tool for this is a list of what you've acquired so far, closed in reverse. There's one rule that takes practice: **one failed close must not stop the others.**

```ts
// @worked-example close-all
export async function closeAll(closers: Array<() => Promise<void>>) {
  const failures: unknown[] = [];
  for (const close of [...closers].reverse()) {
    try {
      await close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Cleanup failed');
}
```

Let's look at the details:

- `[...closers].reverse()` copies first, since `reverse` changes an array in place.
- The `try` is inside the loop. Same idea as your dispatcher: one failure can't skip the rest.
- `AggregateError` is a built-in error that carries a list in `.errors`, so no failure gets lost.

> [!WARNING] Startup failure still wins
> If `closeAll` runs because startup failed, the startup error is still the one that explains what happened. Keep it as the primary error, as you did in `boot`. An `AggregateError` is for a shutdown that the caller asked for.

Now combine that with a promise that's shared by concurrent callers. Two callers can request shutdown at once, so mark the adapter as closed **immediately**, and give both of them the same cleanup. From that moment, `deliver` refuses new work before submitting anything.

```quiz
Q: During cleanup, the second of four closes rejects. What should happen?
- [ ] Stop there and rethrow the error
- [x] Run the remaining closes, then report the failure
- [ ] Ignore the failure and report success
> Skipping the rest leaks real resources. Hiding the failure leaves you thinking everything's fine. So do both jobs: finish, then report.
```

## Testing without pretending

Factories make this testable. A focused test can pass in fake collaborators and hold their promises open, which proves things that would be nearly impossible to stage against real Redis:

| Test | How |
| --- | --- |
| `deliver` doesn't resolve early | Hold the "finished" promise open and check |
| Failed startup closes earlier resources | Reject one `waitUntilReady` |
| One failed close doesn't skip the rest | Reject one `close` |

But those fakes can't prove that the code works with Redis. So the repository also runs the same adapter with real BullMQ, against the isolated Memurai instance on port 6397. Each of those proves a different thing, and they're reported separately. You'd want both in a real project, and "tested" alone wouldn't tell a reviewer much.

## What's left uncovered

No test suite covers everything, and being able to name what's missing is a sign of real understanding. Consider a worker that's killed in the moment between sending an email and writing its receipt. The retry sends the email again, and nothing here can stop that, because the email provider isn't in your transaction.

After you've passed the checkpoint, launch your project in queue mode, then simulate an outage. Explain to yourself why pending work survives, why recovery adds one activity, and why a replay adds none.

## What's next

The next checkpoint replaces the orchestration in `runtime/queue.ts` with your `services/queue-delivery.ts`. The supplied wrapper builds the real library objects and calls your function. Your earlier consumer and dispatcher don't change.
