---
title: 'Three identities, two tokens'
minutes: 25
---

> [!NOTE]
> You can take this module on its own. It leans on one idea from Module 8, that a request's identity lives in `context`, and it reads more easily after Module 24's lessons on plugins and guards.

Everything you've built so far had one kind of person in it: somebody who works at the company and signs in to the product. A **client portal** adds the other kind. It's the website or mobile app that the company's own customers use: to file a ticket, read a help article, check an order.

That one addition is where the confusing names come from. You open a resolver and its context has `user`, `cpUser` and `clientPortal`. One is `undefined`, the other two aren't, and the bug report says "works for staff, fails for customers". This lesson gives each of those names one clear meaning, and shows you the forty lines that fill them in.

## Three things with similar names

| Name on context | What it is | How a request proves it | Kept by |
| --- | --- | --- | --- |
| `user` | A **team member**: an agent, a manager, an admin | A login session with the main product | core |
| `clientPortal` | A **portal**: one customer-facing site and its settings | An app token sent with every request | core |
| `cpUser` | A **customer's account** on one portal | A second token, issued when they sign in | core |

Read the middle row twice, because it's the one people get wrong. `clientPortal` isn't a person. It's a record that says "this site exists, it's called Acme Help, here is how its users may sign in". A company can have several: one for its help centre, one for its mobile app, one for partners. A `cpUser` always belongs to exactly one of them.

So "the request has `clientPortal` but no `cpUser`" isn't a contradiction. It means: **we know which site this came from, and nobody has signed in there yet.** That's the normal state of a login page.

## The customer's app is not inside the product

The staff interface for a plugin loads inside the main product, as you saw in Module 21. A portal doesn't. It's a separate application, on its own domain, that somebody on your team builds and deploys. It reaches the backend the same way anything else does, through the gateway.

```viz-flow
{
  title: 'Two front doors, one gateway',
  colWidth: 220,
  rowHeight: 96,
  nodes: [
    { id: 'staff', label: 'Staff interface', sub: 'inside the product', col: 0, row: 0, color: 'react' },
    { id: 'site', label: 'Customer site', sub: 'own app, own domain', col: 0, row: 1, color: 'react' },
    { id: 'gw', label: 'Gateway', sub: 'userMiddleware', col: 1, row: 0, color: 'forge' },
    { id: 'core', label: 'Core', sub: 'portals and their users', col: 2, row: 0, color: 'mongo' },
    { id: 'plugin', label: 'A plugin', sub: 'tickets, say', col: 2, row: 1, color: 'gql' },
  ],
  edges: [
    { from: 'staff', to: 'gw', label: 'session' },
    { from: 'site', to: 'gw', label: 'two tokens' },
    { from: 'gw', to: 'core' },
    { from: 'gw', to: 'plugin' },
  ],
  steps: [
    { focus: ['staff', 'staff>gw'], caption: 'An agent works inside the product. Their request carries a staff session, and ends up as `context.user`.' },
    { focus: ['site', 'site>gw'], caption: 'A customer never sees that interface. Their site is a separate app, and its requests carry two tokens of their own.' },
    { focus: ['gw'], caption: 'Both arrive at the same gateway and the same GraphQL endpoint. One middleware works out who each request is.' },
    { focus: ['gw>core', 'core'], caption: 'Portals and portal users are stored by core. That\'s where the gateway looks them up.' },
    { focus: ['gw>plugin', 'plugin'], caption: 'The plugin gets the answer on context. The **same** ticket plugin serves the agent and the customer, through different operations.' },
  ],
}
```

That last step matters for how you read code. There's no "portal backend". The ticket plugin that answers an agent's query also answers the customer's. What differs is which operation was called and who the context says is asking.

## Two tokens, two questions

A portal request can carry two headers. They answer different questions.

| Header | Question | Who has the same value |
| --- | --- | --- |
| `x-app-token` | Which portal is this? | Every visitor of that site |
| `client-auth-token` | Which signed-in customer is this? | One person, until it expires |

The app token is created when somebody sets the portal up, and it goes into the site's configuration. Every request from that site sends it, signed in or not. The auth token appears only after a customer signs in, and it may come as a header or as a cookie of the same name.

```viz-sequence
{
  title: 'A signed-in customer asks for their tickets',
  actors: [
    { id: 's', label: 'Customer site', color: 'react' },
    { id: 'g', label: 'Gateway', sub: 'userMiddleware', color: 'forge' },
    { id: 'c', label: 'Core models', color: 'mongo' },
    { id: 'p', label: 'Ticket plugin', color: 'gql' },
  ],
  steps: [
    { from: 's', to: 'g', label: 'x-app-token + client-auth-token', note: 'Two headers on one GraphQL request. No staff session anywhere.' },
    { from: 'g', to: 'c', label: 'ClientPortals.findOne', note: 'The app token is verified and names a portal ID. The gateway loads that portal.' },
    { from: 'g', to: 'c', label: 'CPUsers.findOne', note: 'The auth token names a user ID. The lookup asks for that ID **and** this portal.' },
    { from: 'g', to: 'g', label: 'two headers written', note: 'The portal and the user are written as base64 JSON into `clientportal` and `cpuser` headers.' },
    { from: 'g', to: 'p', label: 'request + headers', note: 'The plugin decodes them into `context.clientPortal` and `context.cpUser`. `context.user` stays empty.' },
  ],
}
```

Here's the real code, shortened a little. It runs after the part that handles staff sessions:

```ts title="backend/gateway/src/middlewares/userMiddleware.ts"
const clientPortalToken = req.headers['x-app-token'];
const clientAuthToken =
  req.headers['client-auth-token'] || req.cookies['client-auth-token'];

if (clientPortalToken) {
  try {
    const decoded: any = jwt.verify(String(clientPortalToken), secret);

    const clientPortal = await models.ClientPortals.findOne({
      _id: decoded.clientPortalId,
    });

    if (!clientPortal) {
      return next();
    }

    req.clientPortal = clientPortal;
    setClientPortalHeader(req.headers, req.clientPortal);

    if (clientAuthToken) {
      try {
        const decodedUser: any = jwt.verify(String(clientAuthToken), secret);

        const clientPortalUser = await models.CPUsers.findOne({
          _id: decodedUser.userId,
          clientPortalId: clientPortal._id,
        });

        if (clientPortalUser) {
          req.cpUser = clientPortalUser;
          setCPUserHeader(req.headers, req.cpUser);
        }
      } catch (e) {
        // an expired or broken token: carry on without a user
      }
    }

    return next();
  } catch (e) {
    return next();
  }
}
```

Read the shape before the details. The user check is **inside** the portal check. That nesting is a rule: there's no such thing as a portal user without a portal.

## Six requests, six contexts

Walk each of these through the code above. Cover the right-hand columns and predict them first.

| The request carries | `clientPortal` | `cpUser` |
| --- | --- | --- |
| Neither token | none | none |
| A valid app token | the portal | none |
| A valid app token and that portal's user token | the portal | the user |
| A valid app token and an **expired** user token | the portal | none |
| A valid user token and no app token | none | none |
| Portal A's app token and a user token from portal B | portal A | none |

The last row is the important one, and one line makes it true:

```compare
--- ✘ Any valid user token will do
const cpUser = await models.CPUsers.findOne({
  _id: decodedUser.userId,
});
// ✘ a customer of portal B is now signed in on portal A
// ✘ and portal A's resolvers will trust that
--- ✔ The user has to belong to this portal
const cpUser = await models.CPUsers.findOne({
  _id: decodedUser.userId,
  clientPortalId: clientPortal._id,
});
// ✔ a token from another portal finds nobody
// ✔ the request carries on as "not signed in"
```

Both tokens are signed with the same secret, so a signature check alone can't tell portal A's customers from portal B's. The database lookup is what ties a user to a portal. You'll see this bug again at the end of the module, from the outside.

## Nothing is turned away here

Look at how every branch ends: `return next()`. A missing portal, a broken token, an expired session: the request carries on, with less identity attached. The gateway **describes** the caller. It doesn't decide what they may do.

That's the same split you met with staff users in Module 24, and it has the same consequence. The check that keeps a stranger out lives in the plugin, on the resolver. The next lesson is about that check.

> [!IMPORTANT] The app token isn't a secret
> It sits in the site's public configuration, so anyone can read it from their browser's network tab. Treat it as a label that says "which portal", never as proof that the caller may do something. Only `cpUser` says a person signed in.

```quiz
Q: A portal's login page sends its first request. What does the plugin's context hold?
- [ ] `user`, because every request has one
- [x] `clientPortal` only: the site is known, and nobody has signed in yet
- [ ] `cpUser` with empty fields
> The app token goes with every request from that site. The auth token doesn't exist until somebody signs in.
```

```quiz
Q: A request arrives with a perfectly valid `client-auth-token` and no `x-app-token`. Who is it?
- [ ] That portal user
- [x] Nobody: the user check only runs inside the portal check
- [ ] A staff user
> A portal user is always "this account on this portal". With no portal named, the code never looks at the user token.
```

```quiz
Q: Customers of the Partners portal can sign in on the Help portal with their Partners accounts. Which line would you read first?
- [ ] The `jwt.verify` call for the app token
- [ ] The resolver that lists tickets
- [x] The `CPUsers.findOne` filter, to see whether it asks for the portal as well as the user ID
> Both tokens share one signing secret, so a Partners token verifies fine. Only the `clientPortalId` in the lookup keeps the two sets of accounts apart.
```

Next you'll write this middleware yourself, in a stricter form, with all six rows of that table as its tests.
