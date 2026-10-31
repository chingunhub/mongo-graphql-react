---
title: "A tenant ID is not permission"
minutes: 22
---

In Taskforge you asked one question: can this user edit this project? Back then there was only one world. Every user and every project lived in the same place.

A system like Relaydesk serves many organizations at once, and that adds a scarier question that comes first: **which organization's data may this request even talk about?** Get this wrong and you don't have a bug, you have a data breach. One customer sees another customer's tickets, and you find out from an angry email.

The word for one of those organizations is a **tenant**. Most of this module is about keeping tenants apart, and the unsettling thing is how many innocent-looking lines of code can let them mix.

## Three questions that sound like one

Mia signs in and asks for a booking in an organization called `north`. Her request carries a token and a requested tenant. Three separate things must be true before we touch a booking:

| Question | Name | Answered by |
| --- | --- | --- |
| Is this really Mia? | **Authentication** | verifying the token |
| Which organization is she asking about? | **Tenant selection** | the request, *then* checked |
| May Mia do *this* in *that* organization? | **Authorization** | her membership and the action |

Now the trap in this lesson's title. A tenant ID in a request tells you what the caller **wants**. It proves nothing about what they're **allowed**. Anyone can type `north` into a header.

```viz-sequence
{title:'From untrusted request to scoped work',actors:[{id:'r',label:'Request',color:'neutral'},{id:'g',label:'Boundary',color:'gql'},{id:'s',label:'Service',color:'mongo'}],steps:[{from:'r',to:'g',label:'token + requested tenant',note:'Both arrive from outside, so **neither is trusted yet**. A header called x-user is not proof of anything.'},{from:'g',to:'g',label:'verify identity',note:'A trusted verifier turns the token into a principal. No principal, no entry.'},{from:'g',to:'g',label:'check membership',note:'Find her role **in this tenant**. An admin role somewhere else counts for nothing here.'},{from:'g',to:'s',label:'context + validated input',note:'From here on, the context carries tenant, actor and request ID. Business input **cannot** replace them.'},{from:'s',to:'s',label:'check action + scope query',note:'Two more checks: may this role do this action, and does the query filter by tenant? Different failures, so they stay separate.'}]}
```

```quiz
Q: Mia is an admin in north and a reader in south. She selects south and asks to triage a ticket. Which role applies?
- [ ] Admin, because she has an admin membership somewhere
- [x] Reader in south
- [ ] Whichever role was cached by the last request
> Roles belong to a membership. The decision is a function of actor, tenant and action together, never of the actor alone.
```

## Context is a lifetime

Remember `context` from Module 8? It's about to matter a lot more. One context is created per request, and it dies with that request. That's what makes it the right home for the tenant.

Here's what happens if you take the shortcut and keep the tenant in a variable that everyone can see. This is one Node process serving two requests. Read it, and guess what `north` gets back:

```ts
// @worked-example global-tenant
let currentTenant = '';

const rows = [
  { tenant: 'north', title: 'North booking' },
  { tenant: 'south', title: 'South booking' },
];

const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

export async function sharedVariable(tenant: string) {
  currentTenant = tenant;
  await pause(); // any await: a database call, a permission lookup
  return rows.find((row) => row.tenant === currentTenant)?.title;
}

export async function perRequest(ctx: { tenant: string }) {
  await pause();
  return rows.find((row) => row.tenant === ctx.tenant)?.title;
}

export const overlap = () => Promise.all([sharedVariable('north'), sharedVariable('south')]);
export const isolated = () => Promise.all([perRequest({ tenant: 'north' }), perRequest({ tenant: 'south' })]);
```

`overlap()` gives you `['South booking', 'South booking']`. North asked for its own data and received South's.

Walk through it slowly. Node runs one thing at a time, and that's exactly why people feel safe here. But every `await` hands the turn to someone else. North sets the variable and pauses. South sets the same variable and pauses. North wakes up and reads a value that South wrote.

No error, no warning, and it **passes every test that sends one request at a time**. It only appears under load, in production, on the worst possible day.

`isolated()` is the fix, and it's almost boring: the tenant travels as a parameter. Each request has its own `ctx`, so nobody can overwrite it.

> [!IMPORTANT]
> "One thread" protects you from two lines running at once. It doesn't protect anything that survives across an `await`. If it outlives the request, it can be seen by the next one.

## A trap in plain objects

Memberships are usually stored as a map from tenant to role. That looks harmless:

```ts
const mia = { memberships: { north: 'admin' } };

mia.memberships['north'];       // 'admin'
mia.memberships['south'];       // undefined, good
mia.memberships['constructor']; // [Function: Object]  !!
```

Every plain object inherits a few properties from `Object.prototype`. So a request that names the tenant `constructor` gets a truthy "role". The request chose that string, which makes it an attacker's string.

`Object.hasOwn(mia.memberships, tenant)` only looks at the object's own keys. Whenever a key comes from a request, reach for it.

## Types document, they don't verify

A `Context` type tells trusted code what to expect. It can't check a token, since types vanish at runtime. In the upcoming lab, `buildContext` receives an already-verified `Principal`, so we can test the *policy* on its own. The final running server maps a few fixed demo tokens to principals. That's a teaching adapter, and it's fine here, but it isn't how production identity works.

## How erxes picks a tenant

In erxes a tenant is called a **subdomain**. When it runs as SaaS, each subdomain gets its own database connection, and a helper builds that request's Mongoose models on it:

```ts
// the shape from backend/plugins/sales_api/src/main.ts
apolloServerContext: async (subdomain, context) => {
  const models = await generateModels(subdomain, context);
  context.models = models;
  context.loaders = createLoaders(subdomain, models);
  return context;
},
```

Look at how much of this you can already read. It's a per-request context, holding per-request loaders. The one real difference is the location of the isolation: erxes separates **databases**, and Relaydesk keeps one database with a `tenant` field, so that cross-tenant mistakes are easy to stage in a test. Module 24 goes through the erxes approach properly.

```viz-flow
{
  title: 'Two places to put the wall',
  colWidth: 230,
  rowHeight: 96,
  nodes: [
    { id: 'req', label: 'Request', sub: 'verified, tenant chosen', col: 0, row: 0, color: 'gql' },
    { id: 'field', label: 'Shared database', sub: 'every query filters by tenant', col: 1, row: 0, color: 'mongo' },
    { id: 'db', label: 'One database per tenant', sub: 'models bound per request', col: 1, row: 1, color: 'mongo' },
    { id: 'auth', label: 'Authorization', sub: 'still required either way', col: 2, row: 0, color: 'forge', },
  ],
  edges: [
    { from: 'req', to: 'field', label: 'Relaydesk' },
    { from: 'req', to: 'db', label: 'erxes SaaS' },
    { from: 'field', to: 'auth' },
    { from: 'db', to: 'auth' },
  ],
  steps: [
    { focus: ['req>field', 'field'], caption: 'A tenant field is cheap and simple. One forgotten filter, however, leaks everything.' },
    { focus: ['req>db', 'db'], caption: 'Separate databases make a forgotten filter harmless. The price is connection management and migrations for every tenant.' },
    { focus: ['auth', 'field>auth', 'db>auth'], caption: 'Neither replaces authorization. The right database can still be read by the wrong person if nobody checked their membership.' },
  ],
}
```

```quiz
Q: A handler stores the tenant in a module-level variable and sets it at the top of every request. Tests pass. What's the risk?
- [ ] None, Node is single-threaded so requests can't overlap
- [x] Another request can overwrite it during any await
- [ ] Only that the variable might be undefined at startup
> Single-threaded doesn't mean one request at a time. Requests interleave at every await, so anything shared across them is exposed.
```

## What's next

The drill is a booking lookup with a less friendly database: it returns rows in a different order and may skip IDs. You'll bring back DataLoader from Module 9, and this time a cached record belongs to one request, not to the whole process.
