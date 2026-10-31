---
title: "Who turns an HTTP request into trusted context?"
minutes: 25
---

You've been calling `buildContext` from tests with a nice typed `Principal` object. A browser can't send that. It sends strings: some headers, in whatever shape arrived.

Something has to look at those strings and decide which are evidence, which are only requests, and which are garbage. In your project, that "something" has been supplied until now. In this module, you take it over.

Open **Relaydesk → Map → HTTP identity**, then **Files**, and follow `runtime/auth.ts` into `packages/contracts/context.ts`. The first owns the translation today, and the second owns permission decisions. Your next checkpoint moves that translation into a function you write.

## Evidence and intent are different

Think about a library card and a verbal request. Your card proves you're a member at North. Saying "I'd like to use South" is a request, and it proves nothing. A system that believes the second because the first was valid has just made anyone a member of anything.

```viz-sequence
{title:'A valid card, a foreign library',actors:[{id:'browser',label:'Browser',color:'react'},{id:'adapter',label:'HTTP adapter',color:'gql'},{id:'policy',label:'Context policy',color:'mongo'}],steps:[
{from:'browser',to:'adapter',label:'token + requested library',payload:'Bearer north-reader; library=south',note:'Both arrive as untrusted strings. The requested library is not evidence of membership.'},
{from:'adapter',to:'adapter',label:'resolve verified principal',payload:'{ id: "reader-1", libraries: ["north"] }',note:'Unknown credentials stop here. There is no anonymous fallback.'},
{from:'adapter',to:'policy',label:'principal + requested library',note:'Reuse the policy you already wrote. A second copy of the rules would drift.'},
{from:'policy',to:'adapter',label:'FORBIDDEN',ret:true,note:'We know who you are, and you can\'t enter South.'},
{from:'adapter',to:'browser',label:'403 response',ret:true,note:'Every transport gets the same answer, so clients show the same failure.'}
]}
```

For this local lab, a table maps synthetic tokens to principals. In production that step is a signed session or an identity service. The token table isn't a login design. It's a stand-in, so that you can learn the boundary.

## Headers are stranger than they look

Node's type for a header value is `string | string[] | undefined`. Here's a small adapter that respects that. It answers one question, using a plain `Record` as its table:

```ts
// @worked-example library-card
type Headers = Record<string, string | string[] | undefined>;
type Member = { id: string; libraries: string[] };

const cards: Record<string, Member> = {
  'card-ana': { id: 'ana', libraries: ['north'] },
};

export function memberFrom(headers: Headers): Member | null {
  const card = headers['x-library-card'];
  if (typeof card !== 'string') return null;
  return Object.hasOwn(cards, card) ? cards[card] : null;
}
```

Predict these before reading on:

| Header value | Result | Why |
| --- | --- | --- |
| `'card-ana'` | Ana | A registered card |
| `undefined` | `null` | Missing |
| `['card-ana', 'card-bob']` | `null` | Which one? Don't guess |
| `'toString'` | `null` | With `cards[card]` alone, this returns a **function** |

The last row is the same trap that you met in Module 15. Every plain object inherits `toString` and `constructor`. Look one up with `cards[card]` and you've got a truthy value, so an attacker with the header `toString` passes your check. `Object.hasOwn` only sees what's really in the table.

> [!WARNING] Duplicate headers surprise people
> The `string[]` type suggests that repeated headers arrive as an array. In practice, Node handles them by name: two `x-tenant` headers arrive as the single string `"north, south"`, and a second `authorization` header is **dropped**. Your code must still handle arrays, since the type allows them and `set-cookie` really does use them. Never assume a string means one sender value, though. Exact matching against known values is what saves you here: `"north, south"` isn't a tenant anyone belongs to.

## Check in a fixed order

The order of your checks is part of your public contract. Suppose the token's bad *and* the tenant's malformed. What does the caller see? Decide, and keep it consistent.

| Check | Failure | Why here? |
| --- | --- | --- |
| 1. Credential | `UNAUTHORIZED` | Say nothing about the request to a stranger |
| 2. Tenant shape | `BAD_REQUEST` | Identified, but the request is unusable |
| 3. Request ID shape | `BAD_REQUEST` | Same |
| 4. Membership | `FORBIDDEN` | Known caller, valid request, no access |

Authentication comes first, because answering a stranger with details about what's wrong in their request teaches them about your system.

```quiz
Q: A known reader supplies a valid token but requests a tenant outside their memberships. Which result preserves the boundary?
- [ ] Build the context from the tenant header
- [x] Reject the request as forbidden
- [ ] Retry using the first tenant in the token
> Authentication succeeded and authorization didn't. Falling back would change the requested operation, instead of explaining why it can't run.
```

## Correlation IDs: reuse, generate or reject

A request ID follows a call through subgraphs. There are three cases:

| Header | Do | Why |
| --- | --- | --- |
| Absent | Generate one | Every request needs one |
| Valid | Reuse it | It's how you trace a call across services |
| Malformed | Reject it | Quietly replacing it means the client and server are tracing different IDs |

"Valid" means something strict, as this value ends up in your logs. Allow a limited alphabet and length, so that nobody writes a megabyte of text or a fake newline into them.

Here's the same three-way decision for a parcel locker's reference header:

```ts
// @worked-example parcel-ref
import { randomUUID } from 'node:crypto';

const SHAPE = /^[A-Za-z0-9-]{1,64}$/;

export function parcelRef(header: string | string[] | undefined): string {
  if (header === undefined) return randomUUID();
  if (typeof header !== 'string' || !SHAPE.test(header)) throw new Error('BAD_REQUEST');
  return header;
}
```

The `typeof` check is there because Node's header type allows an array, and the regex would happily turn one into a string. `^` and `$` pin the whole value, so `'abc\n'` fails. An empty header isn't `undefined` either, so it's rejected rather than replaced. That's correct, because the client did send something, and it was wrong.

```quiz
Q: A client sends x-request-id containing a newline. What should the adapter do?
- [ ] Replace it with a generated ID, so the request still works
- [x] Reject it with BAD_REQUEST
- [ ] Strip the newline and continue
> Silently changing it means the client and server disagree about the ID. And a value bound for your logs has to be strictly checked first.
```

## One adapter, several entry points

REST intake, tRPC mutations and GraphQL queries need the same rules. Federation adds internal HTTP calls too: the gateway forwards identity, and **each subgraph still validates it**.

Why not check at the gateway and trust everything behind it? Because an internal URL isn't a security property. Anything on that network can reach the subgraph directly, and a tenant header sent there would be taken as fact. You met this in Module 17, and here's where it becomes code.

> [!NOTE] What real gateways do
> A common setup has the gateway verify the user and pass identity to plugins through headers, then each plugin's context is built from those. When you read that code, ask the same question: what stops someone calling a plugin directly?

Finally, translate narrowly. Map the known failures from `buildContext` to their transport codes. If something unexpected throws, let it through, and don't relabel a programming error as "bad credentials". You'd spend a day debugging someone's login.

## What's next

The next checkpoint tests odd headers, inherited properties, membership and correlation IDs, and then runs the whole HTTP system against a throwaway database.

Before you start, write down your order of checks, and predict what happens when both the token and tenant are invalid.
