---
title: 'Drill: my tickets, and nobody else''s'
kind: drill
db: true
focus: ['guards.ts', 'resolvers.ts']
readonly: ['Tickets.ts']
---

Now the plugin's side. The gateway has done its work, so your resolvers get a context that may hold a `clientPortal`, a `cpUser`, both or neither. You'll build the wrapper that asks the first two questions, then four ticket operations that answer the third one themselves: **whose record is this?**

`Tickets.ts` is supplied. A ticket has a `subject`, a `status` (`open`, `answered` or `closed`), a `userId` saying who created it, the `clientPortalId` it came through, and a list of `replies`.

```viz-sequence
{
  title: 'Otto asks for Mara\'s ticket',
  actors: [
    { id: 'o', label: 'Otto', sub: 'signed in', color: 'react' },
    { id: 'w', label: 'Wrapper', color: 'forge' },
    { id: 'r', label: 'cpGetTicket', color: 'gql' },
    { id: 'd', label: 'Tickets', color: 'mongo' },
  ],
  steps: [
    { from: 'o', to: 'w', label: 'cpGetTicket(_id)', note: 'Otto copied the ID from a link Mara shared. His own session is perfectly valid.' },
    { from: 'w', to: 'r', label: 'portal ✔ user ✔', note: 'Both guard questions pass. The wrapper has no idea which ticket was asked for.' },
    { from: 'r', to: 'd', label: 'findOne({ _id, owner, portal })', note: 'The owner in this filter comes from **Otto\'s** context, so Mara\'s ticket doesn\'t match.' },
    { from: 'r', to: 'o', label: 'Ticket not found', ret: true, note: 'The same answer as for an ID that never existed. Otto learns nothing.' },
  ],
}
```

## Your task

### 1. The wrapper, in `guards.ts`

`wrapPublicResolver(resolver, config)` returns an async resolver that checks first and then calls the original with all four arguments.

| `config` | Check |
| --- | --- |
| `forClientPortal` | Throws `Client portal required` unless `context.clientPortal` is there |
| …and `cpUserRequired` | Then throws `Client portal user required` unless `context.cpUser` is there |
| Neither, or no config | No check |

A staff `user` on context changes nothing. `markResolvers(resolvers, config)` replaces every resolver of the object with its wrapped version, in place.

### 2. The owner key, in `resolvers.ts`

`ownerKey(cpUser)` returns `cp:` followed by the account's `erxesCustomerId` when it has one, and by its own `_id` otherwise.

A portal ticket belongs to a customer when its `userId` is that customer's owner key **and** its `clientPortalId` is the portal on context. Every operation below uses both.

### 3. The operations

| Operation | Behavior |
| --- | --- |
| `cpCreateTicket({ subject, description? })` | Trims the subject. Empty: `Subject required`. Creates an `open` ticket owned by the caller, in the caller's portal |
| `cpGetTickets({ status? })` | The caller's tickets, newest first. A `status` narrows the list |
| `cpGetTicket({ _id })` | The ticket if it's the caller's. Otherwise `Ticket not found` |
| `cpAddReply({ _id, body })` | Trims the body. Empty: `Reply required`. Adds `{ body, authorId, createdAt }` with the caller's owner key as `authorId`, sets the status to `open`, and returns the updated ticket |

Three rules hold for all of them:

1. **Identity comes from context.** No argument can change whose ticket is created or whose list is returned, whatever it's called.
2. **Not theirs means not found.** Another customer's ticket, another portal's ticket, an ID that doesn't exist and an ID that isn't even an ID all give `Ticket not found`.
3. **Ownership is asked first.** Replying to your own closed ticket gives `Ticket is closed`. Replying to somebody else's closed ticket gives `Ticket not found`.

Then mark both resolver objects, so each operation needs a portal and a signed-in customer.

```ts
const mara = { clientPortal: help, cpUser: { _id: 'u-mara', erxesCustomerId: 'c-17', ... } };

const ticket = await cpTicketMutations.cpCreateTicket(undefined, { subject: 'Printer' }, mara, undefined);
ticket.userId; // 'cp:c-17'

await cpTicketQueries.cpGetTicket(undefined, { _id: ticket._id }, otto, undefined); // rejects: Ticket not found
```

## Hints

### One filter to start from
Three operations need "this customer, in this portal". What if a small function built that part of the filter from context, and each operation added to it?

### An ID that isn't one
`Tickets.findOne({ _id: 'nope' })` doesn't return `null`. It throws a cast error, which would reach the customer as a strange message. What does Mongoose offer for checking an ID before you query with it?

### Closed, or not yours?
An update that matches nothing can't tell you why. If your update's filter includes ownership and "not closed", what second, cheaper question separates the two cases afterwards?

### When to mark
`markResolvers` wraps the functions that are in the object when it runs. Where in the file does the call have to go?
