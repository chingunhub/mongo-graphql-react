---
title: "Drill: the customer's site"
kind: drill
env: dom
focus: ['PortalApp.tsx', 'headers.ts']
readonly: ['portal-api.ts', 'fake-portal.ts', 'preview.tsx']
preview: preview.tsx
---

You've written the gateway's side and the plugin's side. This is the third piece, and maybe your first: the site a customer signs in to. It's one component with a sign-in form and a ticket list. What makes it a portal is that **you** decide which headers each request carries, and how the screen reacts when the gateway stops recognising somebody.

Press **Run preview** as you go. It runs your component against a pretend gateway and lists every request beside it, with the headers it carried and the answer it got. Sign in as `mara@example.com` or `otto@example.com`, password `portal`. Sessions last 45 seconds there, so you can watch one end, and a button breaks the app token on purpose.

```viz-flow
{
  title: 'The screens, and what moves between them',
  colWidth: 220,
  rowHeight: 100,
  nodes: [
    { id: 'in', label: 'Sign in', sub: 'app token only', col: 0, row: 0, color: 'react' },
    { id: 'list', label: 'My tickets', sub: 'both tokens', col: 1, row: 0, color: 'gql' },
    { id: 'broken', label: "Site isn't set up", sub: 'no form', col: 0, row: 1, color: 'neutral' },
  ],
  edges: [
    { from: 'in', to: 'list', label: 'token received' },
    { from: 'list', to: 'in', label: 'sign out, or session ended' },
    { from: 'in', to: 'broken', label: 'Client portal required' },
  ],
  steps: [
    { focus: ['in'], caption: 'Nobody is signed in. The login request carries `x-app-token` and nothing else.' },
    { focus: ['in>list', 'list'], caption: 'The login answer holds a token. Keep it, and send it as `client-auth-token` from now on.' },
    { focus: ['list>in'], caption: 'Two ways back: the customer signs out, or the API answers `Client portal user required`. Either way the old tickets leave the screen first.' },
    { focus: ['in>broken', 'broken'], caption: '`Client portal required` can come from any request. It means the site is misconfigured, and offering a login form would only waste the customer\'s time.' },
  ],
}
```

## Your task

`send(operation, variables, headers)` sends one operation and resolves to `{ data, errors }`. The operation names, the result shapes and the two error messages are in `portal-api.ts`. A result's value is at `data[operation]`, and a failure's text is at `errors[0].message`.

### 1. `portalHeaders(appToken, authToken?)` in `headers.ts`

Always `x-app-token`. Add `client-auth-token` only when there's a token: no key at all when there isn't.

### 2. Signed out

| Element | Details |
| --- | --- |
| A heading | `Sign in` |
| Two inputs | Labelled `Email` and `Password` |
| A button | `Sign in`, disabled while a login is under way. A second submit meanwhile sends nothing |

Submitting sends `LOGIN` with `{ email, password }` and the app token alone. On success, keep `data[LOGIN].token` and show the tickets. On failure, stay on the form and show the message in an element with `role="alert"`, until the next attempt.

### 3. Signed in

Show a heading `My tickets` and a `Sign out` button, and load `TICKETS` with both headers.

| State | Show |
| --- | --- |
| Not loaded yet | `Loading tickets…` in an element with `role="status"` |
| Loaded, none | `No tickets yet` |
| Loaded | A list, one item per ticket, with its subject and status |
| The load failed | The message in a `role="alert"`, and neither of the two lines above |

Below it, a form with an input labelled `Subject` and a `Send` button. It sends `CREATE_TICKET` with the trimmed subject, puts the answer at the top of the list and clears the field. An empty subject sends nothing.

### 4. When identity stops working

| A signed-in request answers | Do |
| --- | --- |
| `Client portal user required` | Forget the token and the tickets. Show the sign-in form with an alert: `Your session ended. Please sign in again.` |
| `Client portal required`, on any request | Show only an alert: `This site isn't set up correctly.` No form |

### 5. Leaving

`Sign out` forgets the token and clears the list at once, with no alert. The next customer starts from "not loaded yet".

An answer can arrive after the session it was asked in has ended: a slow list, or a late "session ended". Drop it. It must not put tickets on screen, and it must not sign the next customer out.

## Hints

### null and empty are different
What value says "I haven't loaded yet", and what value says "I loaded, and there's nothing"? If both are `[]`, which wrong sentence shows for a moment?

### One place that sends
Every request needs the same treatment afterwards: was the session still current, was it one of the two identity errors, and only then the data. What if one small function did the sending and those checks, and your handlers called it?

### Which session asked?
A counter in a `useRef` that goes up on every sign-in and sign-out gives each session a number. Read it before `await`, compare it after.

### Check before you react
The late-answer rule covers errors too. Where does the session comparison have to sit so that an old "session ended" can't touch the new customer?
