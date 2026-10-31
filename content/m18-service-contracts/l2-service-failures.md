---
title: "A timeout tells you what you know"
minutes: 21
---

You send a request to reserve a library room. The connection times out. Quick: was the room reserved?

You don't know, and this is the uncomfortable part: **you can't know**. It might never have arrived. Or the server might have committed it and lost the response on the way back. From the caller's side, those are identical.

```viz-sequence
{title:'Same timeout, two realities',actors:[{id:'c',label:'Caller',color:'react'},{id:'s',label:'Room service',color:'gql'},{id:'db',label:'Database',color:'mongo'}],steps:[{from:'c',to:'s',label:'reserve room 4',note:'The request leaves. So far so good.'},{from:'s',to:'db',label:'write reservation',note:'The reservation is **committed**. It exists now.'},{from:'s',to:'c',label:'response lost',ret:true,note:'The network drops the reply. The caller sees exactly what it would have seen if the request had never arrived.'},{from:'c',to:'c',label:'timeout',note:'The caller now has to decide what to do, knowing nothing about whether the work happened.'}]}
```

Coming from a single server, this is the biggest change in how you think. A function call has two outcomes, returned or threw. A network call has three: it worked, it failed, or **you don't know**.

## Classify failures by what the caller can do

A good error tells the caller what to do next. Here's what the codes mean in practice:

| Failure | What it means | What the caller does |
| --- | --- | --- |
| `BAD_REQUEST` | Input breaks the contract | Fix the input, don't retry |
| `UNAUTHORIZED` | Who are you? | Sign in |
| `FORBIDDEN` | I know you, and no | Ask for access |
| `CONFLICT` | Your expected version is out of date | Reload, look, decide again |
| Timeout / unavailable | **Unknown result** | Retry only if that's safe |

A retry isn't a universal error handler. Repeating a read is harmless. Repeating a payment is how you get a very awkward phone call. And the two things that make a retry safe are ones you've already built: a stable key, like `sourceId`, and an expected version.

```viz-flow
{
  title: 'Should this call be retried?',
  colWidth: 215,
  rowHeight: 92,
  nodes: [
    { id: 'fail', label: 'The call failed', col: 0, row: 0, color: 'neutral' },
    { id: 'known', label: 'Did the server answer?', sub: 'a real error code', col: 1, row: 0, color: 'gql' },
    { id: 'fix', label: "Don't retry", sub: 'fix input, reload, or sign in', col: 2, row: 0, color: 'neutral' },
    { id: 'safe', label: 'Is the operation safe to repeat?', sub: 'a read, or a stable key or version', col: 1, row: 1, color: 'gql' },
    { id: 'retry', label: 'Retry with the same identity', sub: 'bounded, with backoff', col: 2, row: 1, color: 'forge' },
    { id: 'check', label: 'Check first', sub: 'look up the state, or ask a human', col: 1, row: 2, color: 'mongo' },
  ],
  edges: [
    { from: 'fail', to: 'known' },
    { from: 'known', to: 'fix', label: 'yes' },
    { from: 'known', to: 'safe', label: 'timeout, 503' },
    { from: 'safe', to: 'retry', label: 'yes' },
    { from: 'safe', to: 'check', label: 'no' },
  ],
  steps: [
    { focus: ['known', 'known>fix', 'fix'], caption: 'A 400-style answer is a real answer. Retrying the same bad input can only get the same result.' },
    { focus: ['safe', 'safe>retry', 'retry'], caption: 'A new random ID per attempt breaks this path. The retry has to look identical to the first try.' },
    { focus: ['safe>check', 'check'], caption: 'If nothing makes it repeatable, find out what happened before you act.' },
  ],
}
```

```quiz
Q: A mutation times out, and the server may have committed it. What makes a retry safe?
- [ ] Retrying right away with a fresh random request ID
- [x] A documented idempotency or version contract covering the effect
- [ ] Catching every exception and returning success
> A timeout is uncertainty. Reusing the operation's identity lets the server recognize a repeat. A new identity can produce a new effect.
```

## Don't flatten a conflict

Say a triage screen shows a ticket at version 2. Another operator changes the priority, and now your request is out of date.

The tempting "fix" is to load the latest version in the handler and overwrite it, so that the user never sees an error. That throws away the one thing `expectedVersion` was saying: *I decided this while looking at version 2*. The user's decision was based on something that's no longer true. Tell them.

Here's the difference on a room booking screen:

```compare
--- ✘ Never fails, and quietly loses work
await Rooms.updateOne(
  { _id },
  { $set: { capacity }, $inc: { version: 1 } },
);
--- ✔ Says what happened
const saved = await Rooms.findOneAndUpdate(
  { _id, version: expectedVersion },
  { $set: { capacity }, $inc: { version: 1 } },
);
if (!saved) throw new StaleVersion();
```

The left one looks friendlier, and it's the one that overwrites a colleague's change without anyone finding out.

Relaydesk will use `CONFLICT` for two different situations, on purpose: a stale version, and a ticket that's missing or belongs to another organization. If those had different errors, a caller could probe guessed IDs and learn which ones exist elsewhere. The frontend reloads and asks the operator to decide again, which suits both.

## Translate narrowly

Your domain code and your transport are different layers. GraphQL and tRPC can call the same function, and an HTTP status shouldn't decide whether a MongoDB update was atomic.

So one small piece of code at the boundary translates domain outcomes into client-facing errors. The important word is *narrow*:

```ts
// @worked-example narrow-translation
import { TRPCError } from '@trpc/server';

export class StaleVersion extends Error {}

export async function withDomainErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof StaleVersion) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Reload and try again' });
    }
    throw error; // a storage failure stays a storage failure
  }
}
```

Only the failure we recognize changes form. If the database is down, that error passes through and shows up as a 500, because that's the truth. A `catch` that turns everything into "conflict" or an empty result hides real outages, and those are the ones you most need to see.

> [!WARNING] Generic messages, specific logs
> The client gets "Reload and try again". It doesn't get "ticket 65f... belongs to tenant south". Keep the detail in your own logs.

## Test at two distances

tRPC's `createCaller` runs real input parsing and middleware, without HTTP. It's great for policy, validation and domain behavior. There's no server and no port here, and the context is just an argument:

```ts
// @worked-example room-caller
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.context<{ staffId: string | null }>().create();

const signedIn = t.procedure.use(({ ctx, next }) => {
  if (!ctx.staffId) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next();
});

export const roomRouter = t.router({
  resize: signedIn
    .input(z.strictObject({ room: z.string(), capacity: z.number().int().positive() }))
    .mutation(({ input }) => input),
});

export const staff = roomRouter.createCaller({ staffId: 's1' });
export const stranger = roomRouter.createCaller({ staffId: null });

// staff.resize({ room: 'r4', capacity: 8 })    -> { room: 'r4', capacity: 8 }
// staff.resize({ room: 'r4', capacity: 0 })    -> rejects, code BAD_REQUEST
// stranger.resize({ room: 'r4', capacity: 8 }) -> rejects, code UNAUTHORIZED
```

So one line of test can play a signed-in caller, a stranger, or someone with bad input. Because it's so cheap, you can try every case. Here's what each distance can and can't see:

| Test | Crosses | Can't tell you |
| --- | --- | --- |
| `createCaller` | parser, middleware, handler | serialization, headers, proxies |
| Real HTTP client | everything above plus the socket | that a slow network behaves |
| Mongo-backed test | real storage rules | anything about the transport |

When you report a green test, name which boundary it crossed. "Tests pass" is much less useful than "the procedure passes with `createCaller`, and HTTP is covered in Module 22".

```quiz
Q: A handler catches every error and rethrows it as CONFLICT. What's the worst outcome?
- [ ] The response is slightly slower
- [x] A database outage looks like a routine conflict, so nobody investigates and users retry forever
- [ ] tRPC refuses to start
> Translation has to be narrow. An error you don't recognize should stay what it is, so that it reaches the people who can fix it.
```

## What's next

Relaydesk gets its first real mutation between services. Your triage procedure combines a strict parser, your permission policy from Module 15 and the guarded update from Module 16.
