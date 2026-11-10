---
title: 'Drill: who is this request?'
kind: drill
focus: ['gateway.ts']
readonly: ['tokens.ts', 'models.ts']
---

Time to write the forty lines from the lesson. Your function gets a request and core's two models, and its whole job is to **describe the caller**: which portal, and which signed-in customer of that portal, if any. It doesn't refuse anybody. That's the plugin's job, and it comes next.

Two files are supplied. `tokens.ts` has `sign` and `verify`, a small stand-in for the JWT library: `verify` returns the payload or throws. `models.ts` has `ClientPortals.findOne` and `CPUsers.findOne`, which match every field of the filter you give them.

```viz-flow
{
  title: 'What gets attached',
  colWidth: 210,
  rowHeight: 92,
  nodes: [
    { id: 'app', label: 'x-app-token?', sub: 'verify, find the portal', col: 0, row: 0, color: 'forge' },
    { id: 'none', label: 'Nothing', sub: 'an anonymous request', col: 0, row: 1, color: 'neutral' },
    { id: 'auth', label: 'client-auth-token?', sub: 'header, then cookie', col: 1, row: 0, color: 'forge' },
    { id: 'portal', label: 'Portal only', sub: 'nobody signed in', col: 1, row: 1, color: 'mongo' },
    { id: 'both', label: 'Portal + user', sub: 'a signed-in customer', col: 2, row: 0, color: 'gql' },
  ],
  edges: [
    { from: 'app', to: 'none', label: 'missing or bad' },
    { from: 'app', to: 'auth', label: 'portal found' },
    { from: 'auth', to: 'portal', label: 'missing, bad or another portal' },
    { from: 'auth', to: 'both', label: 'user of this portal' },
  ],
  steps: [
    { focus: ['app', 'app>none', 'none'], caption: 'No app token, a token that fails `verify`, or a portal that no longer exists: the request carries on with nothing attached.' },
    { focus: ['app>auth', 'auth'], caption: 'With the portal known, look for the auth token. Only now: a user token without a portal is never examined.' },
    { focus: ['auth>portal', 'portal'], caption: 'A bad auth token doesn\'t undo the portal. The site is still known, so its login page keeps working.' },
    { focus: ['auth>both', 'both'], caption: 'The lookup asks for the user ID **and** this portal. Only then is a customer signed in.' },
  ],
}
```

## Your task

Implement the three functions in `gateway.ts`.

### 1. The headers

| Function | Behavior |
| --- | --- |
| `setHeader(headers, name, value)` | Stores the value as base64 of its JSON |
| `readHeader(headers, name)` | Returns the decoded value. `undefined` when the header is missing, empty or can't be decoded |

### 2. `portalIdentity(req, models)`

| The request carries | Result |
| --- | --- |
| No `x-app-token` | Nothing attached, and no model is called |
| An app token that fails `verify`, or names a portal that isn't found | Nothing attached |
| A good app token | `req.clientPortal`, and the portal in the `clientportal` header |
| …and a good `client-auth-token` for a user **of that portal** | Also `req.cpUser`, and the user in the `cpuser` header |
| …and an auth token that's expired, broken, unknown or from another portal | The portal only |

The app token's payload is `{ clientPortalId }`. The auth token's payload is `{ userId }`, and it comes from the `client-auth-token` header, or failing that from the cookie of the same name. `req.cookies` may be missing.

`portalIdentity` never throws and never rejects. Whatever goes wrong, the request carries on with less attached.

### 3. One thing stricter than the original

A plugin trusts the `clientportal` and `cpuser` headers completely. So before anything else, remove both from the incoming request. Whatever a caller wrote there isn't yours, and only this function may fill them.

```ts
const req = { headers: { 'x-app-token': helpToken } };
await portalIdentity(req, models);

req.clientPortal; // { _id: 'cp-help', name: 'Acme Help' }
req.cpUser; // undefined: the login page of a known site
```

## Hints

### Two failures, two catches
`verify` throws for both tokens. If one `try` wraps everything, what happens to the portal when only the user token is bad?

### Which portal's user?
Both tokens are signed with the same secret, so a valid signature doesn't say where a user belongs. What can you put in the `findOne` filter that does?

### Start clean
Where does a forged `cpuser` header need to be gone by: before the early returns, or after them?
