---
title: 'Drill: live tickets that stay in their tenant'
kind: drill
focus: ['subscriptions.ts']
readonly: ['schema.ts']
---

The lesson's simple channel had a hole, and now you'll close it properly. Your resolvers follow the same shape as erxes: a `generateResolvers(pubsub)` function, returning one entry per subscription field.

The hard part is that some mistakes in here produce no errors at all. Everything looks perfect, right up until someone sees a ticket from another company.

```viz-flow
{
  title: 'Two channels, two ways to stay separate',
  colWidth: 215,
  rowHeight: 92,
  nodes: [
    { id: 'pub', label: 'publishTicketChanged', sub: 'after the write', col: 0, row: 0, color: 'forge' },
    { id: 'detail', label: 'ticketChanged:<subdomain>:<id>', sub: 'one ticket', col: 1, row: 0, color: 'neutral' },
    { id: 'list', label: 'ticketListChanged', sub: 'shared by everyone', col: 1, row: 1, color: 'neutral' },
    { id: 'a', label: 'Detail subscriber', sub: 'the name already separates', col: 2, row: 0, color: 'react' },
    { id: 'b', label: 'withFilter', sub: 'subdomain, then priority', col: 2, row: 1, color: 'gql' },
  ],
  edges: [
    { from: 'pub', to: 'detail' },
    { from: 'pub', to: 'list' },
    { from: 'detail', to: 'a' },
    { from: 'list', to: 'b' },
  ],
  steps: [
    { focus: ['pub', 'pub>detail', 'detail', 'detail>a', 'a'], caption: 'A precise channel needs no filter, as nobody else listens to it.' },
    { focus: ['pub>list', 'list', 'list>b', 'b'], caption: 'A shared channel means that every event reaches every listener. The filter is the only wall.' },
  ],
}
```

## Your task

Context has the shape `{ subdomain, user? }`. Use `pubsub.asyncIterableIterator(channel)`, which is what this version's `PubSub` calls it.

### 1. `publishTicketChanged(pubsub, subdomain, ticket)`

| Channel | Payload |
| --- | --- |
| `` ticketChanged:${subdomain}:${ticket._id} `` | `{ ticketChanged: ticket }` |
| `ticketListChanged` | `{ subdomain, ticketListChanged: ticket }` |

### 2. `generateResolvers(pubsub)`

| Field | Behavior |
| --- | --- |
| `ticketChanged(_id)` | Listens to that subdomain's channel for that ticket |
| `ticketListChanged(priority)` | Listens to the shared channel, using `withFilter` to allow only the caller's subdomain and, when `priority` is given, that priority |

Both throw `Login required` when subscribing without a user.

```ts
// North publishes ticket t1. A South subscriber to ticketChanged(_id: "t1")
// hears nothing, even though South has a ticket t1 too.
```

Don't add a `resolve` function. With the payload keyed by the field name, GraphQL finds the value by itself.

## Hints

### Where does a check go?
`withFilter` runs for each event. Is that the right place to reject someone who was never allowed to subscribe?

### Reading the filter's arguments
`withFilter`'s function receives the payload, the variables and the context. Which of them can you trust to say who's listening?

### Nothing arrives
Log the channel on both sides. Do they match exactly?
