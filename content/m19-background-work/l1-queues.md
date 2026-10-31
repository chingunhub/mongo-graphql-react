---
title: "A queue moves work, not responsibility"
minutes: 25
---

A library lets staff upload a file of 40,000 returned books. Do you make their browser wait? The request would time out, and if the server restarts halfway through, you're stuck with half an import.

So you accept the file quickly and do the work in the background. That's what a queue is for: it records work to be done, and separate **workers** get through it at their own pace.

It's a great tool, and it comes with a trap in its name. A queue doesn't make a job reliable. It moves the failure somewhere you can't see it in a stack trace. Everything in this module is about that.

## A job has a life

The first time you debug a queue, the question is "where's my job?". So here are the states:

```viz-flow
{
  title: 'The life of a job',
  colWidth: 170,
  rowHeight: 92,
  nodes: [
    { id: 'wait', label: 'waiting', sub: 'nobody has claimed it', col: 0, row: 0, color: 'neutral' },
    { id: 'active', label: 'active', sub: 'a worker holds a lock', col: 1, row: 0, color: 'gql' },
    { id: 'done', label: 'completed', sub: 'the worker returned', col: 2, row: 0, color: 'forge' },
    { id: 'delayed', label: 'delayed', sub: 'waiting out the backoff', col: 1, row: 1, color: 'mongo' },
    { id: 'failed', label: 'failed', sub: 'out of attempts', col: 2, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'wait', to: 'active', label: 'claimed' },
    { from: 'active', to: 'done', label: 'returned' },
    { from: 'active', to: 'delayed', label: 'threw' },
    { from: 'delayed', to: 'wait', label: 'timer', dashed: true },
    { from: 'active', to: 'failed', label: 'no attempts left' },
    { from: 'active', to: 'wait', label: 'lock lost', dashed: true },
  ],
  steps: [
    { focus: ['wait', 'wait>active', 'active'], caption: 'A worker claims the job and has to keep renewing its lock while it runs.' },
    { focus: ['active>delayed', 'delayed', 'delayed>wait'], caption: 'Throwing fails this attempt, not the job. It waits, then goes around again.' },
    { focus: ['active>wait'], caption: 'If the worker dies, the lock expires and another worker runs the job **again**. Some of the work may have already happened.' },
    { focus: ['active>failed', 'failed'], caption: 'After the last attempt, it stops here. Nothing happens next unless someone looks.' },
  ],
}
```

Look at the third step again. That's where a queue quietly becomes at-least-once delivery. A stable job ID can't help, because it's the **same** job running twice. That's why your safety must live in the domain effect. The next lesson goes through it.

## BullMQ in one page

BullMQ keeps queue state in Redis. It has three pieces, and they're usually in different processes.

```ts
import { Queue, Worker, QueueEvents, UnrecoverableError } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis('redis://127.0.0.1:6397', { maxRetriesPerRequest: null });

// 1. The producer. This runs in your API.
const imports = new Queue('imports', { connection });
await imports.add(
  'row',
  { library: 'north', rowId: 'r-1' },
  {
    jobId: 'north.r-1',
    attempts: 4,
    backoff: { type: 'exponential', delay: 250 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
);

// 2. The consumer. This usually runs in another process.
const worker = new Worker(
  'imports',
  async (job) => {
    if (!job.data.rowId) throw new UnrecoverableError('Bad row, never retry');
    return importRow(job.data); // throw on failure, return on success
  },
  { connection, concurrency: 5 },
);

// 3. The observer. It can watch any job from anywhere.
const events = new QueueEvents('imports', { connection });
events.on('failed', ({ jobId, failedReason }) => console.log(jobId, failedReason));
```

Let's go through what each option really means, because these are the settings you'll change in a real codebase.

| Option | Meaning | The catch |
| --- | --- | --- |
| `attempts: 4` | Total tries, **including the first** | So three retries |
| `backoff` | Wait 250, 500, 1000 ms between tries | Stops a struggling service getting hammered |
| `jobId` | Your identity for this job | Adding an ID that still exists does nothing, and colons aren't allowed in custom IDs |
| `removeOnComplete: 100` | Keep only the last 100 | So it's **not** a permanent dedupe record |
| `concurrency: 5` | Jobs running at once in this worker | They interleave at each `await` |

> [!WARNING] Return means success
> The only way a worker says "this failed" is by throwing. Wrap your effect in a `try/catch` that logs and carries on, and BullMQ marks the job **completed**. Your dashboard is green and the work is gone.

`maxRetriesPerRequest: null` is required: a Worker's connection blocks while waiting for jobs, and BullMQ refuses a connection set up any other way.

`UnrecoverableError` is the way to say "don't bother retrying". Remember the table from the last module: a bad row is like `BAD_REQUEST`, and it'll never succeed however long you wait.

In erxes, you'll find that this has been wrapped for you. `createMQWorkerWithListeners(service, queueName, processor, redis, onReady)` builds a worker named `${service}-${queueName}`, and `sendWorkerQueue(service, queueName)` gives you the queue. Same pieces, one layer up.

## Retries are a budget

Exponential backoff sounds fancy, and it's only "double the wait each time". Try it. Set a budget, choose a failure and see where each attempt lands:

```viz retry-lab
{}
```

Three things to find in the lab:

- A **permanent** failure spends no budget, since retrying can't help.
- A transient outage longer than the budget still ends in `failed`, and someone has to look at it.
- A cap on the delay stops the wait growing without limit.

Retry budgets exist because the alternative is a permanently broken job burning resources forever.

```quiz
Q: attempts is 4 and the first attempt fails. How many retries remain?
- [ ] Four
- [x] Three
- [ ] Unlimited until the worker restarts
> attempts counts the first try too. A finite budget stops a permanently broken job from consuming work forever.
```

## What belongs in a message

A job's data goes through JSON and sits in Redis. So what do you put in there?

```compare
--- ✘ A dump of whatever was handy
await queue.add('opened', {
  ticket,                 // a Mongoose document
  headers: req.headers,   // tokens!
  send: emailClient.send, // functions don't survive JSON
});
--- ✔ A small, versioned envelope
await queue.add('opened', {
  version: 1,                 // so consumers can evolve
  id: event.id,               // stable across retries
  tenant: ctx.tenant,         // there's no request later!
  ticketId: String(ticket._id),
  type: 'ticket.opened',
  requestId: ctx.requestId,   // what caused this
});
```

Look at the comment on `tenant`. Background work runs with **no HTTP request**, so there's no context to read it from. The tenant has to travel with the event. Forget that, and your worker ends up guessing or, worse, running without a filter.

A reference also raises a question: if the event says "ticket 7", should the worker read ticket 7's *current* state or the state when the event happened? Both are valid, and you have to choose. Decide it once and write it down.

```quiz
Q: A worker's processor catches every error, logs it, and returns. What happens when the database is down?
- [x] BullMQ records the jobs as completed, and the work is lost
- [ ] BullMQ retries anyway because of the logged error
- [ ] The worker crashes and Redis restores the job
> A queue learns the outcome only from return or throw. Swallowing the error is telling the queue that everything's fine.
```

## How the exercises run

The drills and forge steps run the consumer against real MongoDB, and check the enqueue contract with an injected queue, so that failures are repeatable without needing Redis. Module 22 connects the real BullMQ transport, and `npm run verify:redis` proves it against a live server. An adapter test doesn't prove that a worker recovers from a crash, so we'll keep those two claims separate.

## What's next

The drill is the decision inside a retry, with no queue at all: given a failure, what's the next delay? It's small, it's pure, and it's easy to get off by one.
