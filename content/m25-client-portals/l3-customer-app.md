---
title: "The customer's app"
minutes: 25
---

This is the side you may never have built: the site a customer opens. It sounds like a different world from plugin work, and it's less than you'd think. A portal site is an ordinary React app with three decisions of its own: where the app token lives, where the auth token rides, and what the screen does when either stops working.

## An ordinary app, pointed at the gateway

The real template for a portal site is a Next.js project. Strip away the pages and you find two settings and one small file:

| Setting | What it holds |
| --- | --- |
| `ERXES_API_URL` | Where the gateway is |
| `NEXT_PUBLIC_ERXES_CP_TOKEN` | This portal's app token |

```ts title="apps/client-portal-template/modules/apollo/apolloClient.ts"
const authLink = new SetContextLink(({ headers }) => {
  return {
    headers: {
      ...headers,
      'x-app-token': process.env.NEXT_PUBLIC_ERXES_CP_TOKEN,
    },
  };
});

const httpLink = new HttpLink({
  uri: `${process.env.ERXES_API_URL}/graphql`,
  fetchOptions: {
    credentials: 'include',
  },
});

return new ApolloClient({
  cache: new InMemoryCache(),
  link: authLink.concat(httpLink),
});
```

That's the Apollo link chain from Module 10, with two lines doing the portal work.

**`'x-app-token'` goes on every request.** The link adds it whether or not anybody is signed in. That's what makes the first row of the guard, "which portal?", pass for the login page.

**`credentials: 'include'` lets the cookie travel.** A site on one domain calling a gateway on another doesn't send cookies unless it asks to. With this line, the browser attaches the `client-auth-token` cookie by itself. You'll remember which side reads it: the gateway you wrote looks in the header first, then in the cookie.

## Where the auth token rides

So there are two ways for a signed-in customer's token to reach the gateway, and you'll meet both.

| | As a cookie | As a header |
| --- | --- | --- |
| Who stores it | The browser, when the login answer sets it | Your code |
| Who attaches it | The browser, on every request | Your code, in a link |
| Where you'll see it | Websites | Mobile apps, and scripts |
| What you must remember | `credentials: 'include'`, and the server's CORS settings | To add it, and to forget it on sign-out |

A mobile app has no cookie jar it can rely on, so it keeps the token the login returned and sends it as `client-auth-token` itself. That's the version you'll build in the drill, because it makes every step visible: you hold the token, you decide which requests carry it.

## Signing in, step by step

Signing in is one mutation. What matters is which headers each request carries.

```viz-sequence
{
  title: 'From the login page to "my tickets"',
  actors: [
    { id: 'u', label: 'Customer', color: 'neutral' },
    { id: 's', label: 'Portal site', color: 'react' },
    { id: 'g', label: 'Gateway', color: 'forge' },
    { id: 'c', label: 'Core', sub: 'portal users', color: 'mongo' },
    { id: 'p', label: 'Ticket plugin', color: 'gql' },
  ],
  steps: [
    { from: 'u', to: 's', label: 'email + password', note: 'Nobody is signed in. The site holds an app token and nothing else.' },
    { from: 's', to: 'g', label: 'login mutation · x-app-token', note: '`clientPortalUserLoginWithCredentials`, with **one** header. The gateway attaches the portal and no user.' },
    { from: 'g', to: 'c', label: 'portal ✔', note: 'The login operation is marked `forClientPortal` only. It has to work for somebody who isn\'t signed in yet.' },
    { from: 'c', to: 's', label: 'token', ret: true, note: 'Core checks the password against **this portal\'s** accounts and answers with a token. On a website it also sets the cookie.' },
    { from: 's', to: 'g', label: 'cpGetTickets · both tokens', note: 'From now on, two headers. The gateway finds the portal, then the user within it.' },
    { from: 'g', to: 'p', label: 'portal ✔ user ✔', note: 'The plugin\'s wrapper passes, and the resolver filters by the owner it reads from context.' },
    { from: 'p', to: 's', label: "this customer's tickets", ret: true, note: 'Nothing in this last request said whose tickets to load. The token did.' },
  ],
}
```

Notice step three. The login operation can't require a portal user, because producing one is its whole purpose. That's the middle row of the table from the last lesson: a known portal, and nobody signed in.

A portal can also be set up for sign-in with a one-time code. The shape is the same with one more round trip: ask for a code with the app token, send the code back with the app token, receive the auth token.

## Two errors, two different screens

Remember the two messages from the wrapper? On the site they need opposite reactions, and mixing them up gives customers a bad afternoon.

| The API answers | It means | The site should |
| --- | --- | --- |
| `Client portal user required` | This visitor's session is over | Go back to sign-in, say why, show nothing of the old session |
| `Client portal required` | The site's own app token is wrong | Say the site is broken. A sign-in form can't fix it |
| Anything else | An ordinary failure | Show it, and keep the customer where they are |

```compare
--- ✘ Every auth-looking error means "sign in again"
if (error.message.includes('required')) {
  showLoginForm();
}
// ✘ a wrong app token shows a login form
// ✘ the customer types a correct password
// ✘ and gets the same error, forever
--- ✔ Each message gets its own reaction
if (message === 'Client portal user required') {
  endSession('Your session ended. Please sign in again.');
} else if (message === 'Client portal required') {
  showBrokenSite();
}
// ✔ one is about a person, the other about the site
```

The left version is how "customers can't log in" tickets are born when the real fault is a deployment with the wrong token in its settings.

## Signing out clears the screen, too

A portal is often used on a shared computer: a shop's front desk, a family laptop. Signing out has to do more than forget a token.

```viz-flow
{
  title: 'What a sign-out has to end',
  colWidth: 215,
  rowHeight: 96,
  nodes: [
    { id: 'out', label: 'Sign out', col: 0, row: 0, color: 'react' },
    { id: 'token', label: 'The token', sub: 'forgotten', col: 1, row: 0, color: 'forge' },
    { id: 'data', label: 'What is on screen', sub: 'tickets, drafts', col: 1, row: 1, color: 'gql' },
    { id: 'late', label: 'Answers still on their way', sub: 'from the old session', col: 2, row: 1, color: 'mongo' },
  ],
  edges: [
    { from: 'out', to: 'token' },
    { from: 'out', to: 'data' },
    { from: 'data', to: 'late' },
  ],
  steps: [
    { focus: ['out', 'out>token', 'token'], caption: 'The obvious part. The next request carries the app token only.' },
    { focus: ['out>data', 'data'], caption: 'The list on screen belongs to the person who just left. Clear it at once, not when the next person\'s list arrives.' },
    { focus: ['data>late', 'late'], caption: 'A request sent before the sign-out can answer after it. If that answer is put on screen, the next visitor sees the last visitor\'s tickets.' },
  ],
}
```

That third case is the same race you met in Module 23 when a response arrived for a tenant you'd left. The fix has the same shape: every answer checks that the session it was asked in is still the current one, and is dropped otherwise.

## Finding a portal bug from the browser

When a portal feature fails, you can usually name the layer from the browser's network tab before you open any code. Click the failing request and look at three things.

| Look at | If you see | Then |
| --- | --- | --- |
| Request headers | No `x-app-token` | The site's configuration or its link chain. Nothing later can work |
| Request headers and cookies | No `client-auth-token` in either | The site lost the session, or the cookie isn't being sent across domains |
| The response's error message | `Client portal user required` with a token present | The gateway rejected the token: expired, or it belongs to another portal |
| The response's data | An empty list and no error | Identity is fine. Read the resolver's filter, and the owner key it was stored under |

That table is the whole module in four rows: the site, the gateway, the guard and the resolver, in the order a request meets them.

```quiz
Q: A portal site works on your machine. After deployment, every visitor sees an error on the login page itself. What do you check first?
- [ ] Whether the customers' passwords were migrated
- [x] Whether the deployed site has the right app token in its settings
- [ ] The ticket resolver's ownership filter
> Nobody is signed in on a login page, so only the first guard question can fail there. That one is about the site's configuration.
```

```quiz
Q: A mobile app shows "my tickets" correctly, then shows "Client portal user required" after a few hours. The app token never changed. What happened?
- [x] The auth token expired, so the gateway attached the portal and no user
- [ ] The portal was deleted
- [ ] The resolver's filter is wrong
> An expired token isn't rejected at the gateway. The request carries on with less identity, and the plugin's wrapper refuses it.
```

```quiz
Q: On a shared computer, Mara signs out and Otto signs in. For a moment Otto sees Mara's tickets. The API is filtering correctly. Where's the bug?
- [ ] In the gateway's user lookup
- [x] In the site: old data stayed on screen, or a late answer from Mara's session was displayed
- [ ] In the app token
> The server gave each of them the right list. The site kept, or accepted, an answer that belonged to a session that had ended.
```

Next you'll build that site: a sign-in form, a ticket list, and the two reactions that keep customers out of trouble.
