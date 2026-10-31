---
title: 'Subscriptions: the server speaks first'
minutes: 30
---

Everything you've built so far has one rhythm: the client asks, the server answers. That's fine until two agents have the same deal open, and one of them moves it. The other is now looking at a screen that's wrong, and nothing is going to tell them.

You could poll every few seconds, and for plenty of screens that's a sensible choice. But erxes has a lot of screens where "a few seconds ago" isn't good enough, so it uses **GraphQL subscriptions**: the third operation type, and the only one we haven't touched in this course. It's a small idea with one very sharp edge, and the sharp edge is the one you've been sharpening since Module 15.

## The moving parts

A subscription is a long-lived operation. The client sends a document that looks like a query, and instead of one result it gets a stream of them, usually over a WebSocket.

```graphql
subscription WatchOrder($_id: ID!) {
  orderChanged(_id: $_id) {
    _id
    status
  }
}
```

There are three actors, and it's worth meeting them before any code:

```viz-sequence
{
  title: 'One mutation, one waiting subscriber',
  actors: [
    { id: 'a', label: 'Agent A', sub: 'watching', color: 'react' },
    { id: 's', label: 'Subscription resolver', color: 'gql' },
    { id: 'p', label: 'PubSub', sub: 'channels', color: 'forge' },
    { id: 'm', label: 'Mutation resolver', color: 'gql' },
    { id: 'b', label: 'Agent B', sub: 'editing', color: 'react' },
  ],
  steps: [
    { from: 'a', to: 's', label: 'subscribe orderChanged(o1)', note: 'The socket stays open. Nothing comes back yet.' },
    { from: 's', to: 'p', label: 'listen on orderChanged:o1', note: 'The resolver returns an async iterator: a stream GraphQL pulls from.' },
    { from: 'b', to: 'm', label: 'mutation: ship order', note: 'An ordinary mutation. It saves to the database first.' },
    { from: 'm', to: 'p', label: 'publish(orderChanged:o1, payload)', note: 'The mutation has no idea who is listening. It just publishes.' },
    { from: 'p', to: 's', label: 'payload', ret: true, note: 'Every iterator on that channel gets it.' },
    { from: 's', to: 'a', label: 'selected fields', ret: true, note: 'The client\'s selection set runs against the payload, just like a query.' },
  ],
}
```

**Notice what the publisher doesn't know.** A mutation publishes to a name. Whoever's listening on that name gets the event. That loose coupling is exactly what makes it nice, and exactly what makes it dangerous.

## Your first channel

Here's the small version, using the in-memory `PubSub` from `graphql-subscriptions`. A shop, not tickets, so there's something left for you to do in the drill:

```ts
// @worked-example simple-channel
import { PubSub } from 'graphql-subscriptions';

export type Order = { _id: string; status: string };

export const channel = (_id: string) => `orderChanged:${_id}`;

export const publishOrderChanged = (pubsub: PubSub, order: Order) =>
  pubsub.publish(channel(order._id), { orderChanged: order });

export const generateResolvers = (pubsub: PubSub) => ({
  orderChanged: {
    subscribe: (_root: unknown, { _id }: { _id: string }) =>
      pubsub.asyncIterableIterator(channel(_id)),
  },
});
```

Three details here carry a lot of weight:

1. **A subscription resolver is an object with `subscribe`,** not a plain function. `subscribe` returns the stream.
2. **The payload is keyed by the field name.** `{ orderChanged: order }` is how GraphQL finds the value for the `orderChanged` field. You can skip that by adding a `resolve` function, and erxes does in places: `resolve: (payload) => payload.salesDealChanged`.
3. **Order matters when you test it.** The iterator doesn't subscribe until it's first read. Publish before anyone's pulling, and the event goes nowhere. That's why the tests call `next()`, wait a tick, and only then publish.

## The hole

Now do the Module 15 thing and ask: **who's on the other end?**

Say two companies each have an order with the id `o1`. In Relaydesk's `tenant id` world that's perfectly normal, and with per-tenant databases nothing stops it: uniqueness only holds inside one database. North's agent publishes, and the channel name is `orderChanged:o1`. South's agent is subscribed to `orderChanged:o1`.

```viz-flow
{
  title: 'A channel name is a global namespace',
  colWidth: 210,
  rowHeight: 92,
  nodes: [
    { id: 'n', label: 'North mutation', sub: 'publishes o1', col: 0, row: 0, color: 'forge' },
    { id: 'c', label: 'orderChanged:o1', sub: 'no tenant in the name', col: 1, row: 0, color: 'mongo' },
    { id: 'a', label: 'North agent', col: 2, row: 0, color: 'react' },
    { id: 'b', label: 'South agent', sub: 'should hear nothing', col: 2, row: 1, color: 'react' },
  ],
  edges: [
    { from: 'n', to: 'c' },
    { from: 'c', to: 'a' },
    { from: 'c', to: 'b', dashed: true, label: 'leak' },
  ],
  steps: [
    { focus: ['n', 'n>c'], caption: 'The database wrote into North\'s data. Everything was correct up to here.' },
    { focus: ['c'], caption: 'Redis channels aren\'t per tenant. They\'re one flat namespace for the whole deployment.' },
    { focus: ['c>b', 'b'], caption: 'Per-tenant databases can\'t help you, because this data never touched a database on its way to South.' },
  ],
}
```

That last caption is the thing to remember. In erxes you can drop the tenant filter from every query, because the models are scoped. **Pub/sub doesn't go through the models.** It's a separate, flat, global road, and every rule you relied on stops applying.

The real channel names at this revision look like the one above, for what it's worth: `` `salesDealChanged:${_id}` ``, with no subdomain in the string. erxes gives its documents long random string ids (`mongooseStringRandomId`), so a collision there is very unlikely, and that may be why nobody needed to add it. But "unlikely" is a very different claim from "impossible", and an id can be copied from anywhere. In the drill you'll make it impossible.

There are two good fixes, and you'll use both:

```compare
--- ✘ One flat name for everyone
pubsub.asyncIterableIterator(`orderChanged:${_id}`);
--- ✔ Put the tenant in the name, when you know the id
pubsub.asyncIterableIterator(`orderChanged:${subdomain}:${_id}`);
```

The second fix is for the case where a shared channel is unavoidable.

## `withFilter`: one channel, many listeners

A board wants every change on a whole list, not one id. erxes uses a single shared channel for those, and decides per listener:

```ts title="backend/plugins/sales_api/src/apollo/subscription.ts"
salesDealListChanged: {
  subscribe: withFilter(
    () => graphqlPubsub.asyncIterator('salesDealListChanged'),
    async (payload, variables, { subdomain }) => {
      const { deal, oldDeal, pipelineIds } = payload.salesDealListChanged;
      // ...
      if (!pipelineIds.includes(pipelineId)) {
        return false;
      }
      // ...
    },
  ),
},
```

`withFilter` wraps the stream with a function that runs **once for every event, for every listener**, and returns true to deliver. It receives the payload, the subscription's variables and the context. Here's the small version:

```ts
// @worked-example filtered-channel
import { PubSub, withFilter } from 'graphql-subscriptions';

export type Sale = { subdomain: string; region: string; total: number };

type Variables = { region?: string };
type Context = { subdomain: string };

export const generateResolvers = (pubsub: PubSub) => ({
  saleAdded: {
    subscribe: withFilter(
      () => pubsub.asyncIterableIterator('saleAdded'),
      (payload: { saleAdded: Sale } | undefined, variables: Variables | undefined, context: Context | undefined) => {
        const sale = payload?.saleAdded;
        if (!sale || sale.subdomain !== context?.subdomain) return false;
        return !variables?.region || sale.region === variables.region;
      },
    ),
  },
});
```

Check which side each value comes from, because that's the whole point. `context.subdomain` was worked out by the server. `variables.region` was typed by the client. So a filter on `variables` is a *preference*, and a filter on `context` is a *boundary*. If you accept the tenant as a variable, anybody can subscribe to anybody.

And the check runs on every event for every listener, so keep it cheap. A database call in there is a query per event per person watching.

> [!WARNING] The filter is too late for authentication
> `withFilter` runs when events arrive. Someone with no session can still open the subscription and sit there. If they aren't allowed to subscribe, reject them in `subscribe`, up front. Don't lean on the filter to do that job.

## Memory or Redis?

The in-memory `PubSub` has a limit that's easy to miss: it only reaches listeners **in the same process**. Run two copies of a plugin and a mutation on copy A won't reach a client connected to copy B.

| | `PubSub` (in memory) | `RedisPubSub` (erxes) |
| --- | --- | --- |
| Reaches | One process | Every process on that Redis |
| Good for | Tests, single-process demos | Production |
| Stream method | `asyncIterableIterator` | `asyncIterator` |
| Delivery | Best effort | Best effort. Nobody listening means it's gone |

That last row matters too. Pub/sub isn't a queue. Unlike your BullMQ work in Module 19, a client that's offline for ten seconds misses those events for good. Nothing retries. So **a subscription is a hint that something changed, not the record of what changed.** When a client reconnects, it has to refetch. Don't ever build something on subscriptions that must not lose a message.

In erxes, plugins don't serve subscriptions themselves. Each plugin exposes its subscription definitions, and the gateway loads them and serves the socket. That's what `subscriptionPluginPath` was doing in `startPlugin`, and what you'll find in `apollo/subscription.ts`:

```ts title="backend/plugins/sales_api/src/apollo/subscription.ts"
export default {
  name: 'sales',
  typeDefs: `
    salesDealChanged(_id: String!): DealSubscription
    # ...
  `,
  generateResolvers: (graphqlPubsub) => ({
    salesDealChanged: {
      resolve: (payload) => payload.salesDealChanged,
      subscribe: (_, { _id }) => graphqlPubsub.asyncIterator(`salesDealChanged:${_id}`),
    },
    // ...
  }),
};
```

## The client side

On the frontend you've got two tools. `useSubscription` gives a component a stream of its own. `subscribeToMore` attaches a stream to an existing `useQuery`, so events can update the cached list, which is usually what you want for a list page.

```ts title="A list that stays fresh"
const { data, subscribeToMore } = useQuery(GET_ACTIVITIES);

useEffect(() => {
  const unsubscribe = subscribeToMore({
    document: ACTIVITY_CHANGED,
    updateQuery: (prev, { subscriptionData }) => {
      if (!subscriptionData.data) return prev;
      return { activities: [subscriptionData.data.activityChanged, ...prev.activities] };
    },
  });

  return unsubscribe;
}, [subscribeToMore]);
```

The important line is the `return`. `subscribeToMore` hands you a function that closes the stream, and returning it makes it the effect's cleanup. You've done this for fetches and timers: anything an effect opens, its cleanup closes.

erxes does this properly in `useUnreadNotificationCount`. It doesn't in `useActivities`, which calls `subscribeToMore` inside `useEffect(..., [])` and returns nothing. So each time that component mounts, another stream opens, and the old one keeps running. In development with Strict Mode, that's two from the start.

> [!TIP]
> When you see `subscribeToMore`, or `useEffect` around anything long-lived, look for the `return` first. It's a quick check, and it finds real leaks.

```quiz
Q: A mutation publishes to `dealChanged:${_id}` and the plugin uses per-tenant databases. Why doesn't that keep the event inside the tenant?
- [ ] Because `_id` isn't indexed
- [x] Pub/sub doesn't go through the models, so database scoping doesn't apply to it
- [ ] Because mutations aren't scoped to tenants
> A channel is one name in one flat namespace. The tenant boundary has to be built into the channel name, or into a filter that uses the trusted context.
```

```quiz
Q: In a `withFilter` function, where should the tenant come from?
- [ ] `variables`, because the client knows which tenant it wants
- [ ] `payload`, on its own
- [x] Compare the payload's tenant with `context`, which the server worked out
> Anything in `variables` was written by the client. The payload says whose event this is, and the context says who's listening. You need both, and only the context is trusted about the listener.
```

```quiz
Q: A client's Wi-Fi drops for ten seconds, then its WebSocket reconnects. What happened to the events published during the gap?
- [ ] Redis stored them and they're delivered on reconnect
- [ ] Apollo Client replays them
- [x] They're gone, so the client should refetch when it reconnects
> Pub/sub is fire and forget. That's the big difference from the queue you built in Module 19.
```

The drill is the same shape as that real `subscription.ts` file, and this time the boundary has to be airtight.
