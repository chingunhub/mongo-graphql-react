---
title: "TypeScript cannot validate a received request"
minutes: 24
---

Here's something that surprises people the first time they really think about it. You write a function that takes `daysLate: number`. TypeScript is happy. Every caller in your repo passes a number. Then a request arrives over HTTP with `daysLate: "two"`, and your function runs anyway.

TypeScript didn't fail. It wasn't there. Types are erased at build time, so at runtime a request is just bytes. An old mobile client, a curl command, or a partner's broken integration can send absolutely anything.

Services in a real system talk to each other a lot, so "what's checking this call?" is a question you'll ask daily.

## Four contracts, four moments

You now have four different things called a contract or a schema. They overlap, and none of them replaces another.

| Contract | When it acts | What it protects |
| --- | --- | --- |
| TypeScript type | compile time | mistakes in code compiled against it |
| Zod schema | when a value is received | the actual shape and values |
| GraphQL schema | when an operation runs | the public query and response structure |
| Mongoose Schema | when writing to the database | stored documents, for the operations it validates |

A way to see the differences is to follow one value on its way in:

```viz-flow
{
  title: 'One value, several gates',
  colWidth: 200,
  rowHeight: 96,
  nodes: [
    { id: 'code', label: 'Your editor', sub: 'TypeScript checks your calls', col: 0, row: 0, color: 'react' },
    { id: 'wire', label: 'The network', sub: 'just bytes, nothing checks here', col: 1, row: 0, color: 'neutral' },
    { id: 'zod', label: 'Zod parser', sub: 'is this value acceptable?', col: 2, row: 0, color: 'gql' },
    { id: 'ctx', label: 'Context + policy', sub: 'may this caller do it?', col: 3, row: 0, color: 'forge' },
    { id: 'db', label: 'Mongoose + indexes', sub: 'may this be stored?', col: 3, row: 1, color: 'mongo' },
  ],
  edges: [
    { from: 'code', to: 'wire', label: 'types erased' },
    { from: 'wire', to: 'zod' },
    { from: 'zod', to: 'ctx' },
    { from: 'ctx', to: 'db' },
  ],
  steps: [
    { focus: ['code', 'code>wire'], caption: 'TypeScript protects only what was compiled against it, and it disappears before anything is sent.' },
    { focus: ['wire', 'wire>zod', 'zod'], caption: 'Anything can arrive here. The first thing that really looks at the value is a runtime parser.' },
    { focus: ['ctx'], caption: 'A perfectly shaped request can still come from someone with no right to make it. Parsing says nothing about permission.' },
    { focus: ['db'], caption: 'The last line of defense. A unique index holds even when every layer above has a bug.' },
  ],
}
```

## Zod in five minutes

Zod lets you describe a value, and then check real data against that description at runtime. A library lets members renew a loan:

```ts
// @worked-example renewal-parser
import { z } from 'zod';

export const renewal = z
  .object({
    cardId: z.string().regex(/^[a-z0-9]{8}$/),
    weeks: z.number().int().min(1).max(4),
  })
  .strict();

export type Renewal = z.infer<typeof renewal>; // the type comes from the parser

export function check(input: unknown) {
  const result = renewal.safeParse(input);
  return result.success ? result.data : result.error.issues.map((issue) => issue.path.join('.'));
}
```

Run some values through `check` in your head:

| Input | Result |
| --- | --- |
| `{ cardId: 'abcd1234', weeks: 2 }` | the same object, now trusted |
| `{ cardId: 'abcd1234', weeks: '2' }` | `['weeks']`, a string isn't a number |
| `{ cardId: 'abcd1234', weeks: 2.5 }` | `['weeks']`, must be an integer |
| `{ cardId: 'abcd1234', weeks: 2, admin: true }` | `['']`, an unknown key fails at the top level |

Two useful ideas are hiding here. `z.infer` means the **type comes from the parser**, so they can't drift apart. And `.strict()` rejects unknown fields. Without it, Zod silently strips them, which is safe but hides a client that's sending the wrong thing.

Notice what's *not* there: no coercion. Zod has `z.coerce.number()`, which turns `"2"` into `2`, and that's sometimes what you want for query strings. For a service contract you want the mistake to be loud.

> [!NOTE]
> The sandbox has Zod 4, and plenty of real repos are still on Zod 3. Everything in this lesson works the same in both, but some error-formatting details changed. Check the version before copying a recipe.

## tRPC: the same types on both ends

tRPC connects a server's procedures to a client's types with no code generation. A **router** groups **procedures**. Each one can parse its input, read trusted context, enforce a rule, and call your domain code.

A library estimates a late fee. Watch how the day count and the member arrive by different routes:

```ts
// @worked-example library-fee
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.context<{ memberId: string | null }>().create();
export const lateFeeRouter = t.router({
  estimate: t.procedure
    .input(z.object({ daysLate: z.number().int().min(0).max(365) }).strict())
    .query(({ input, ctx }) => {
      if (!ctx.memberId) throw new TRPCError({ code: 'UNAUTHORIZED' });
      return { cents: input.daysLate * 25 };
    }),
});
export type LateFeeRouter = typeof lateFeeRouter;

// An in-process caller runs the same parser and procedure, without HTTP.
// lateFeeRouter.createCaller({ memberId: 'm1' }).estimate({ daysLate: 2 })
// resolves to { cents: 50 }. A string or fractional value is rejected.
```

Predict the outcome for `daysLate: 2`, `daysLate: "2"` and `daysLate: 2.5`. Only the first reaches the callback. The other two are refused with `BAD_REQUEST` before your code runs. And a valid day count with no member gets past the parser and fails on the `UNAUTHORIZED` guard, because a parser can't make a policy decision.

Throw `TRPCError` for failures you intend. A plain `Error` becomes `INTERNAL_SERVER_ERROR`, which tells the caller something's wrong with *you*.

### The client imports a type, and nothing else

That last line, `export type LateFeeRouter`, is the clever part. A client can import only the router's type, not its implementation, and still get checked inputs and outputs:

```ts
// @worked-example fee-client
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { LateFeeRouter } from './server'; // erased at build time

export const connect = (url: string) =>
  createTRPCClient<LateFeeRouter>({ links: [httpBatchLink({ url })] });

// const client = connect('http://127.0.0.1:4000');
// await client.estimate.query({ daysLate: 2 }); // { cents: 50 }
```

`import type` matters: no server code ends up in the client bundle. `httpBatchLink` is the transport, and "batch" means calls made in the same tick share one HTTP request, the same idea as DataLoader. Queries use `.query()`, and mutations use `.mutate()`.

Now the key point. The client's TypeScript catches your mistakes while you code. It can't reach an app version that shipped last month, so **the server parses every time**.

```quiz
Q: A tRPC client compiles with kilograms: number. Can the server skip runtime validation?
- [ ] Yes, tRPC guarantees that all callers are TypeScript
- [x] No, received data and deployed clients can violate the static type
- [ ] Only if the client is on the same version
> Static types describe code checked at build time. Runtime parsers check the actual request. They also enforce things that a plain number type can't express, such as a positive weight.
```

## Context can't be overwritten by input

A procedure's input holds the ticket ID and the intended change. Tenant, actor and role come from the request context. So what if a caller sends `tenant: 'south'` in the payload?

```ts
// ✘ The caller just chose their own tenant.
const ctx2 = { ...ctx, ...input };
```

That line turns a business payload into a privilege escalation. With a strict parser, the extra field is rejected with `BAD_REQUEST`, and it's easy to see in the logs. Even without one, never spread input over trusted context.

```quiz
Q: A procedure's input schema is strict, and a caller adds tenant: 'south'. What happens?
- [x] BAD_REQUEST, before the handler runs
- [ ] The handler runs in the south tenant
- [ ] The field is copied onto the context
> Strict objects reject unknown keys, so a forged field is loud rather than ignored. The tenant still comes only from verified context.
```

## Finding this in erxes

erxes mounts a tRPC router per plugin, with a context factory. Calls go through a helper that you'll see all over:

```ts
await sendTRPCMessage({
  subdomain,
  pluginName: 'content',
  module: 'portal',
  action: 'portalUserCard',
  input: { userId },
});
```

When tracing one, ask the questions from this lesson. Who supplies the tenant? Where's the input parsed? Which domain function owns the write? And importing another plugin's model would skip the boundary you've just learned to respect, so don't.

## What's next

The shipping drill changes both the domain and the validation rules, so build it from the brief. After that, Relaydesk uses this on a mutation that can race with another operator.
