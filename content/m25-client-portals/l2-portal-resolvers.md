---
title: 'What a customer may see'
minutes: 25
---

The gateway you just wrote describes a caller and turns nobody away. So a request from a stranger, from a login page, and from a signed-in customer all reach the plugin. This lesson is about the plugin's side: how it learns who's calling, how it marks an operation as "for portals", and the question no guard can answer for you, which is **whose record is this?**

## One plugin, two audiences

There's no separate backend for portals. The ticket plugin an agent uses is the one a customer's site calls. The plugin builds its context from the headers the gateway wrote, all three at once:

```ts title="backend/erxes-api-shared/src/utils/apollo/utils.ts"
const user: any = extractUserFromHeader(req.headers);
const cpUser: any = extractCPUserFromHeader(req.headers);
const clientPortal: any = extractClientPortalFromHeader(req.headers);

const context = {
  user,
  cpUser,
  clientPortal,
  subdomain,
  // ...
};
```

Every resolver in the plugin gets that same context. What separates the audiences is which operations exist for whom, and by convention the portal ones carry a `cp` prefix:

| An agent calls | A customer's site calls |
| --- | --- |
| `getTickets`, `createTicket`, `updateTicket` | `cpGetTickets`, `cpGetTicket`, `cpCreateTicket` |
| Guarded by a staff login and permissions | Guarded by a portal, and usually a portal user |
| Sees the company's tickets | Should see their own |

When you're lost in a plugin, that prefix is a quick map: search for `cp` and you've found everything a customer can reach.

## Marking an operation for portals

Staff resolvers are wrapped to require a login, as you saw in Module 24. Portal resolvers are marked differently, at the bottom of their file:

```ts title="backend/plugins/frontline_api/src/modules/ticket/graphql/resolvers/queries/clientPortal.ts"
markResolvers(cpTicketQueries, {
  wrapperConfig: {
    forClientPortal: true,
    cpUserRequired: true,
  },
});
```

And this is what that marking turns into when the schema is built:

```ts title="backend/erxes-api-shared/src/core-modules/permissions/utils.ts"
export const wrapPublicResolver = (resolver: Resolver, wrapperConfig: any) => {
  return async (parent: any, args: any, context: any, info: any) => {
    const { cpUserRequired, forClientPortal } = wrapperConfig || {};

    if (forClientPortal) {
      if (!context.clientPortal) {
        throw new Error('Client portal required');
      }

      if (cpUserRequired && !context.cpUser) {
        throw new Error('Client portal user required');
      }
    }

    return resolver(parent, args, context, info);
  };
};
```

Two flags give you three kinds of operation:

| Flags | Who gets through | Typical use |
| --- | --- | --- |
| `forClientPortal` | Any request from a known portal | Login, registration, public help articles |
| `forClientPortal` + `cpUserRequired` | A signed-in customer of that portal | My tickets, my profile |
| Neither | Decided some other way | Not a portal operation |

Those two error messages are worth memorising, because they're the first thing you'll see when a portal feature fails. `Client portal required` means the site's app token is missing or wrong: a configuration problem, the same for every visitor. `Client portal user required` means this visitor isn't signed in, or their token expired: a session problem, for one person.

Notice what isn't checked: `context.user`. A staff session neither helps nor hurts here. An agent's browser calling `cpGetTickets` without an app token gets `Client portal required`, like anybody else.

## Signed in isn't the same as allowed

Here's the ladder a portal request climbs. The guard covers the first two rungs.

```viz-flow
{
  title: 'Three questions, in order',
  colWidth: 215,
  rowHeight: 96,
  nodes: [
    { id: 'q1', label: 'Which portal?', sub: 'context.clientPortal', col: 0, row: 0, color: 'forge' },
    { id: 'q2', label: 'Which customer?', sub: 'context.cpUser', col: 1, row: 0, color: 'forge' },
    { id: 'q3', label: 'Whose record?', sub: 'your resolver', col: 2, row: 0, color: 'gql' },
    { id: 'e1', label: 'Client portal required', col: 0, row: 1, color: 'neutral' },
    { id: 'e2', label: 'Client portal user required', col: 1, row: 1, color: 'neutral' },
    { id: 'e3', label: 'Ticket not found', col: 2, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'q1', to: 'q2' },
    { from: 'q2', to: 'q3' },
    { from: 'q1', to: 'e1' },
    { from: 'q2', to: 'e2' },
    { from: 'q3', to: 'e3' },
  ],
  steps: [
    { focus: ['q1', 'q1>e1', 'e1'], caption: 'The wrapper asks this first. A failure here is about the **site**: its app token is missing or wrong.' },
    { focus: ['q2', 'q2>e2', 'e2'], caption: 'Then, if the operation needs it, who is signed in. A failure here is about one **visitor**.' },
    { focus: ['q3', 'q3>e3', 'e3'], caption: 'No wrapper can ask the third question, because only your resolver knows which record was requested. This rung is yours to build, every time.' },
  ],
}
```

The third rung is where portal bugs live. Mara and Otto are both signed-in customers of the same help portal. The guard is equally happy with both. If the resolver then does this, Otto can read Mara's ticket by changing an ID in the address bar:

```compare
--- ✘ The guard passed, so load the record
async cpGetTicket(_root, { _id }, { models }) {
  return models.Tickets.getTicket(_id);
}
// ✔ refuses strangers and signed-out visitors
// ✘ any signed-in customer can read any ticket
// ✘ IDs leak: emails, links, guesses
--- ✔ The record has to be theirs
async cpGetTicket(_root, { _id }, { models, cpUser, clientPortal }) {
  const ticket = await models.Tickets.findOne({
    _id,
    userId: ownerKey(cpUser),
    clientPortalId: clientPortal._id,
  });
  if (!ticket) throw new Error('Ticket not found');
  return ticket;
}
// ✔ the owner is part of the query
// ✔ "not yours" and "doesn't exist" look the same
```

Two details in the right-hand version are deliberate.

**The owner is in the filter.** Loading the ticket first and comparing afterwards works too, but a filter can't be forgotten halfway through a refactor, and it never loads a stranger's data into memory.

**The answer is `Ticket not found`.** Saying "that ticket isn't yours" tells the caller it exists. For a customer-facing endpoint, a record that isn't theirs simply isn't there.

## How a ticket remembers its customer

So what's `ownerKey`? Look at how the real mutation records who created a ticket:

```ts title="backend/plugins/frontline_api/src/modules/ticket/graphql/resolvers/mutations/clientPortal.ts"
cpCreateTicket: async (_parent, params, { models, subdomain, cpUser, clientPortal }) => {
  const userId = cpUser.erxesCustomerId || cpUser._id || clientPortal._id;

  const ticket = await models.Ticket.addTicket(params, `cp:${userId}`, subdomain);
  // ...
},
```

There are two ideas in those two lines.

**`erxesCustomerId` links the account to the customer record.** A portal account is for signing in. The customer record is what agents see in the product: name, company, history. When the two are linked, the ticket is filed under the customer, so it shows up in their history for staff. When they aren't, the portal account's own ID is used.

**The `cp:` prefix says "not a team member".** A ticket's `userId` normally holds the agent who created it. Prefixing a portal creator keeps the two kinds of ID from ever colliding, and lets the staff interface show "created from the portal" without another field.

```viz-sequence
{
  title: 'One ticket, both sides',
  actors: [
    { id: 's', label: 'Customer site', color: 'react' },
    { id: 'p', label: 'Ticket plugin', color: 'gql' },
    { id: 'd', label: 'Tickets', color: 'mongo' },
    { id: 'a', label: 'Staff interface', color: 'react' },
  ],
  steps: [
    { from: 's', to: 'p', label: 'cpCreateTicket', note: 'Mara is signed in, so the wrapper lets the call through with `cpUser` on context.' },
    { from: 'p', to: 'd', label: "userId: 'cp:c-17'", note: 'The owner comes from **context**. Mara\'s account is linked to customer `c-17`, so that\'s the key.' },
    { from: 'a', to: 'p', label: 'getTickets', note: 'An agent lists tickets through the staff operation. They see Mara\'s, marked as created from the portal.' },
    { from: 's', to: 'p', label: 'cpGetTickets', note: 'Mara lists hers. The resolver filters by the same key it wrote, taken from context again.' },
    { from: 'p', to: 's', label: "Mara's tickets only", ret: true, note: 'Otto\'s request runs the same code with his own `cpUser`, so the same filter gives him his own list.' },
  ],
}
```

## Identity comes from context, never from arguments

There's one more way to get the third rung wrong, and it looks innocent:

```compare
--- ✘ The site says whose tickets it wants
async cpGetTickets(_root, { createdBy }, { models }) {
  return models.Tickets.find({ userId: `cp:${createdBy}` });
}
// ✘ arguments are written by the caller
// ✘ Otto sends createdBy: "c-17" and reads Mara's list
--- ✔ The gateway says who is asking
async cpGetTickets(_root, _args, { models, cpUser, clientPortal }) {
  return models.Tickets.find({
    userId: ownerKey(cpUser),
    clientPortalId: clientPortal._id,
  });
}
// ✔ nothing the caller types can change the owner
```

Everything in `args` was typed by whoever sent the request. Everything in `context.cpUser` was looked up by the gateway from a verified token. When a resolver needs to know **who**, there's only one of those it can trust.

> [!IMPORTANT] Read the third rung yourself
> `cpUserRequired` is a claim about the first two rungs only. When you work on a portal operation in the real codebase, open its resolver and find the line that ties the record to `cpUser`. If you can't find one, you've found something worth raising with your team. That habit matters more than anything else in this lesson.

```quiz
Q: A new portal site shows "Client portal required" on every page, for every visitor, signed in or not. Where's the problem?
- [x] The site's app token: it's missing from the requests, or it's wrong
- [ ] The visitors' sessions have expired
- [ ] The ticket resolver's ownership filter
> That error comes from the first rung, and it doesn't depend on who's visiting. Check the site's configuration and the request headers before you read any resolver.
```

```quiz
Q: A resolver is marked `forClientPortal` and `cpUserRequired`. What does that tell you about which tickets it returns?
- [ ] Only the signed-in customer's tickets
- [ ] Only that portal's tickets
- [x] Nothing: it says who may call, and the resolver's own query decides what comes back
> The wrapper never sees the record. Ownership is in the resolver or it's nowhere.
```

```quiz
Q: A customer's account has no `erxesCustomerId`. With the real `cpCreateTicket`, who owns a ticket they file?
- [ ] Nobody, so the mutation fails
- [x] `cp:` followed by the portal account's own ID
- [ ] The portal itself, always
> The fallback chain is the linked customer, then the account, then the portal. The first one that exists wins.
```

Next you'll build both halves: the wrapper, and four ticket operations that only ever hand a customer their own records.
