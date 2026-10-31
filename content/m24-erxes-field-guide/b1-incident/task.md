---
title: 'Bug hunt: the Friday incident'
kind: bughunt
db: true
summary: 'Two support reports and a log excerpt. No file names, no failing line. Find the cause and fix it.'
focus: ['api.ts']
---

This one's different. Nobody's going to tell you which file is wrong, and the test names only describe what users see. That's what your first real incident will feel like, so treat it as a rehearsal.

Here's what landed in the support channel:

> **#4471, North, 12:09.** "Our dashboard sometimes shows numbers that aren't ours. It said 41 open tickets and we've got 6."
>
> **#4472, North, 12:11.** "An agent clicked a ticket and got *Ticket not found*. They refreshed and it opened. It's happened a few times today, always when it's busy."

And this is what the logs show around that time:

```text
12:04:11.204  req=8f1 sub=north  ticket.open  id=66f1a2   200   9ms
12:04:12.118  req=8f2 sub=north  ticket.open  id=66f1a2   ...
12:04:12.119  req=8f3 sub=south  auth.login                ...
12:04:12.126  req=8f3 sub=south  auth.login                200   7ms
12:04:12.131  req=8f2 sub=north  ticket.open  id=66f1a2   ERROR Ticket not found
12:04:13.402  req=8f4 sub=north  ticket.open  id=66f1a2   200   8ms
12:05:02.771  req=8f5 sub=south  summary                   200  21ms
12:05:03.015  req=8f6 sub=north  summary                   200   0ms
```

Before you open a file, read those lines the way a detective would. What's different about the request that failed? It's the same ticket, the same user and the same company as the requests either side of it. What was happening at the moment it failed? And why would a report take `0ms` straight after one took `21ms`?

## Your task

1. Work out why those two reports happen. Write down your theory before you change anything. The tests are worded as symptoms, so they won't tell you where to look.
2. Fix the cause, not the symptom.
3. Keep what's working. The session check stays, and so does the summary's one-minute memory, because it exists for a real reason: the dashboard asks for it constantly. A change in one company refreshes that company's summary and leaves every other company's alone.

`api.ts` is where requests start, and its function signatures stay as they are. Everything else in the project is yours to change.

> [!TIP]
> A bug that only shows up "when it's busy" is telling you something. Ask what's different when two requests are in the same process at the same time.

## Hints

### Follow one request
Pick the failed `ticket.open` and read everything it touches, from `api.ts` down, in the order it runs. At each step, ask how this code knows which company it's working for.

### Mark the awaits
Between any two `await`s, other requests get to run. Find a value that's set before an `await` and read after it. Who else can write to that value in between?

### Two symptoms
There may be more than one thing wrong here. Fixing the failed open won't obviously explain the `0ms` summary. What exactly identifies a stored summary?

### Compare with the pattern
You built a model class earlier in this module. How did its statics reach `models`, and why was that safe with two companies in flight?
