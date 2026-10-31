---
title: "Follow one request through the system"
minutes: 23
---

A customer says their ticket is in the inbox, but the activity entry is missing. The UI said it succeeded. No error page appeared. So: is it a frontend bug? A queue outage? A malformed event? A stopped dispatcher?

Now you know why operating a system is different from writing one. In a single process, a stack trace tells you where you are. Across a request, a queue and a worker, **nothing connects those pieces unless you put the connection there.**

In this module you build that. You'll start by asking what evidence could tell those four explanations apart, before you change a line of code.

## Three IDs, three questions

| ID | Identifies | Question it answers | Across retries |
| --- | --- | --- | --- |
| Request ID | the request that started it | What caused this? | stays the same |
| Event ID | a durable fact | Has this been handled? | stays the same |
| Job ID | a piece of queue work | Where is it in the queue? | stays the same |
| Attempt number | one try | Which try was this? | changes |

They're related, but each answers its own question. The important line is the last column: a retry must not erase what originally caused the work. That's why the envelope in Module 19 carried `requestId` all the way through.

Follow one through, with the IDs in hand:

```viz-sequence
{title:'Trace the missing activity',actors:[{id:'http',label:'Intake',color:'gql'},{id:'db',label:'Ticket + intent',color:'mongo'},{id:'w',label:'Worker',color:'forge'}],steps:[{from:'http',to:'db',label:'r17 → event e9',note:'Intake accepted it. The ticket holds durable pending intent, so nothing can be lost from here on.'},{from:'db',to:'w',label:'deliver e9 / request r17',note:'The worker keeps the event identity **and** the request that caused it.'},{from:'w',to:'db',label:'activity receipt e9',note:'A unique receipt proves this effect committed.'},{from:'db',to:'http',label:'pending count = 0',ret:true,note:'Acknowledgement follows the effect. A report is a view of the state, and not a replacement for the receipt.'}]}
```

Each arrow is a question you can check. Pending intent there but no receipt? The dispatcher or worker. No pending intent and no receipt? Look at intake. A receipt but no entry on screen? It's the frontend, or a tenant filter. Four possible causes, narrowed down by two lookups.

## Logs, metrics and traces

These three get lumped together as "observability". They answer different questions.

| Tool | Answers | Example |
| --- | --- | --- |
| **Log** | What happened in this one case? | `{ requestId: 'r17', outcome: 'error' }` |
| **Metric** | How much, how often, how slow overall? | pending jobs, p95 duration |
| **Trace** | Where did the time go across services? | spans for one operation |

Here's a gotcha that has taken down real monitoring systems. Metrics are stored per unique combination of labels, so a request ID as a metric label makes one new time series per request. That's called **high cardinality**, and it gets expensive fast. IDs go in logs and traces. Metrics get small fixed sets, like `outcome: ok|error`.

## Measure at the boundary

Most of what you want can be captured by one small wrapper around each step. Look at what it records, and what it does with the error:

```ts
// @worked-example timed-step
type Fields = { requestId: string; tenant: string; operation: string };
type Log = (entry: Fields & { outcome: 'ok' | 'error'; durationMs: number }) => void;

export async function timed<T>(log: Log, fields: Fields, work: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  const finish = (outcome: 'ok' | 'error') =>
    log({
      requestId: fields.requestId,
      tenant: fields.tenant,
      operation: fields.operation,
      outcome,
      durationMs: performance.now() - startedAt,
    });
  try {
    const result = await work();
    finish('ok');
    return result;
  } catch (error) {
    finish('error');
    throw error; // measuring a failure must not hide it
  }
}
```

It's a boring piece of code, which is the goal. Every boundary gets the same fields, so you can search them all the same way: intake accepted, intent saved, job enqueued, worker started, receipt committed, acknowledgement stored.

Run a step by hand in the playground, once with work that resolves and once with work that rejects, and print the entries.

## Allowlist your logs

Now look closely at how `finish` built that object: field by field, with no `...fields`. That wasn't accidental.

```compare
--- ✘ Denylist
const { password, ...safe } = req;
logger.info(safe);
// ✘ next month someone adds req.apiToken
// ✘ it's in your logs, forever, and nobody decided that
--- ✔ Allowlist
logger.info({
  requestId: req.id,
  tenant: ctx.tenant,
  operation: 'ticket.ingest',
});
// ✔ a new field stays out until someone chooses it
```

A denylist has to anticipate every secret anyone will ever add. An allowlist fails safe. Logs often live longer and travel further than your database, so they end up with more people than you'd expect.

> [!WARNING] Errors can carry secrets too
> Logging a whole error object can include the failed query, the request config or a connection string. Log a stable error code or the message, and check what your logger prints for nested objects.

```quiz
Q: Which identifier should stay the same when an event is delivered a second time?
- [x] The event ID
- [ ] A new event ID for every worker attempt
- [ ] The worker's process ID
> Attempts can have their own numbers, but the durable event identity has to survive retries so that deduplication and your investigation can connect them.
```

## Be precise about health

"Is it up?" hides two questions:

- **Liveness**: can this process respond at all? If not, restart it.
- **Readiness**: can it do its required work right now? If not, stop sending it traffic.

```compare
--- ✘ Always healthy
app.get('/health', (req, res) => res.send('ok'));
// ✘ says ok when MongoDB is unreachable
// ✘ says ok before the indexes exist
--- ✔ Separate questions
app.get('/live', (req, res) => res.send('ok'));
app.get('/ready', async (req, res) => {
  await mongoose.connection.db.admin().ping();
  res.send('ok');
});
// ✔ a database outage takes it out of rotation
// ✔ and doesn't trigger pointless restarts
```

If liveness checks the database, a short database blip makes your orchestrator restart every service at once, which turns a blip into an outage. Keep the two separate.

```quiz
Q: A team adds requestId as a label on a request-duration metric. What's the problem?
- [ ] Metrics can't hold strings
- [x] Every request creates a new time series, and the metrics system pays for that
- [ ] The request ID leaks a secret
> Request IDs are unbounded. Put them in logs and traces, and keep metric labels to small fixed sets.
```

## What's next

The drill turns allowlisting into code. Then the next lesson takes up the question this one left open: if work is pending, how does the system recover by itself?
