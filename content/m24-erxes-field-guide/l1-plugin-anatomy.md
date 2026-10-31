---
title: 'The anatomy of an erxes plugin'
minutes: 30
---

For ten modules, Relaydesk has been a practice field: it's built around the same ideas as erxes, but small enough to hold in your head. Now we stop translating.

Everything in this module comes from reading the real erxes source at revision `ddf3736be3` (February 2026). When you see a code block with a path on it, that's real code, trimmed for length. The drills use a small kit with the same names and call shapes, so what you write here will look familiar when you open the real thing.

Here's the honest headline: **you already know the ideas, and some of the decisions are different.** Those differences are what trip people up in their first week, because the code looks almost like what they expect. So we'll be careful about them.

## A plugin is a folder with a shape

erxes is a monorepo with one core API and a set of plugins in `backend/plugins`: `sales_api`, `operation_api`, `frontline_api`, and so on. Each one is its own service with its own port. Once you've seen one, you've seen the shape of all of them.

```viz-tree
{
  title: 'backend/plugins/sales_api/src',
  root: {
    id: 'src', label: 'src/', color: 'neutral',
    children: [
      { id: 'main', label: 'main.ts', value: 'calls startPlugin', color: 'forge' },
      { id: 'conn', label: 'connectionResolvers.ts', value: 'IModels, IContext, generateModels', color: 'mongo' },
      { id: 'apollo', label: 'apollo/', value: 'joins the module schemas and resolvers', color: 'gql' },
      {
        id: 'mod', label: 'modules/sales/', color: 'neutral',
        children: [
          { id: 'db', label: 'db/', value: 'definitions (schemas) and models (classes)', color: 'mongo' },
          { id: 'graphql', label: 'graphql/', value: 'schemas, resolvers, loaders', color: 'gql' },
          { id: 'trpc', label: 'trpc/', value: 'what other plugins may call', color: 'react' },
        ],
      },
    ],
  },
  steps: [
    { focus: ['main'], caption: 'Start every investigation here. It names the port, the context and the subscription file.' },
    { focus: ['conn'], caption: 'This file answers "which models exist?" and "what is on context?". Keep it open in a tab.' },
    { focus: ['apollo'], caption: 'A thin layer that spreads each module\'s pieces into one schema. The real work is one level down.' },
    { focus: ['db', 'graphql', 'trpc'], caption: 'A feature lives here. Schemas sit in `definitions`, the statics that use them in `models`.' },
  ],
}
```

## It all starts with one call

Open `main.ts` in any plugin and you'll find the same function:

```ts title="backend/plugins/sales_api/src/main.ts"
startPlugin({
  name: 'sales',
  port: 3305,
  graphql: async () => ({
    typeDefs: await typeDefs(),
    resolvers,
  }),
  expressRouter: router,
  hasSubscriptions: true,
  subscriptionPluginPath: require('path').resolve(__dirname, 'apollo', 'subscription.ts'),
  apolloServerContext: async (subdomain, context) => {
    const models = await generateModels(subdomain, context);
    context.models = models;
    context.loaders = createLoaders(subdomain, models);
    return context;
  },
  trpcAppRouter: { router: appRouter, createContext: async (subdomain, context) => { /* ... */ } },
});
```

Read that as a table of contents. `apolloServerContext` runs on every request, and it's where a request gets tied to one customer. Notice that `loaders` are built fresh inside it, the rule you learned in Module 9 and hardened in Module 15. Same per-request idea, different name on the door.

`startPlugin` itself lives in `erxes-api-shared`. It builds the Express app, the subgraph schema, the tRPC mount, and registers the plugin so that the gateway can find it. Plugins mostly don't touch any of that.

## One request, all the way through

The word to learn here is **subdomain**. In erxes that's the customer: `north.erxes.io` is North. Where Relaydesk says tenant, erxes says subdomain.

```viz-sequence
{
  title: 'A query reaches a plugin',
  actors: [
    { id: 'b', label: 'Browser', color: 'react' },
    { id: 'g', label: 'Gateway', sub: 'Express', color: 'forge' },
    { id: 'r', label: 'Apollo Router', sub: 'separate binary', color: 'gql' },
    { id: 'p', label: 'sales_api', sub: 'subgraph', color: 'gql' },
    { id: 'd', label: 'MongoDB', color: 'mongo' },
  ],
  steps: [
    { from: 'b', to: 'g', label: 'POST /graphql + cookie', note: 'The gateway verifies the token and turns it into a `user` header.' },
    { from: 'g', to: 'r', label: 'forward', note: 'erxes runs the real Apollo Router, not the `@apollo/gateway` library you used in Module 17. Same query planning, different process.' },
    { from: 'r', to: 'p', label: 'subgraph fetch', note: 'The router only sends the fields this plugin owns.' },
    { from: 'p', to: 'p', label: 'apolloServerContext', note: 'Reads the subdomain, gets that customer\'s models, builds fresh loaders.' },
    { from: 'p', to: 'd', label: 'context.models.Deals.find', note: 'There is no tenant filter in this query, and that\'s not a bug. Keep reading.' },
    { from: 'd', to: 'b', label: 'data', ret: true, note: 'The router merges the plugin responses into one result.' },
  ],
}
```

## The biggest difference: models, not filters

That note about the missing filter is the big one. In Relaydesk you put `tenant` on every document and in every query. erxes does this instead:

```ts title="backend/plugins/sales_api/src/connectionResolvers.ts"
export const loadClasses = (db: mongoose.Connection, subdomain: string, eventDispatcher) => {
  const models = {} as IModels;
  models.Checklists = db.model<IChecklistDocument, IChecklistModel>(
    'sales_checklists',
    loadCheckListClass(models, subdomain, dispatcher),
  );
  // ...and dozens more
  return models;
};

export const generateModels = createGenerateModels<IModels>(loadClasses);
```

`generateModels(subdomain)` hands back a set of models. In a SaaS deployment, each set is bound to that customer's own database, via `mongoose.connection.useDb(...)`. So `models.Deals.find({})` can't see another customer: it's looking in a different database. **The boundary moved from every query to one line in the context.**

There's a wrinkle you should know, because it'll surprise you when you read the code:

| Deployment | `generateModels` does |
| --- | --- |
| SaaS | Looks up the organization by subdomain, then `useDb` for its own database |
| Self-hosted | Uses `mongoose.connection` directly. One customer, one database |

So there are two different worlds in one function, and you can only see the second one's safety by knowing the first. Most code in a plugin can't tell which world it's in, and that's the idea.

## The model class pattern

Here's the small version of what you'll build next. A class holds the statics, and a closure hands them `models`:

```ts
// @worked-example load-class
import { Schema, type Connection, type Model } from 'mongoose';

type Note = { text: string };

interface INoteModel extends Model<Note> {
  getNote(_id: string): Promise<Note>;
}

export interface IModels {
  Notes: INoteModel;
}

const noteSchema = new Schema<Note>({ text: { type: String, required: true } });

const loadNoteClass = (models: IModels) => {
  class NoteClass {
    public static async getNote(_id: string) {
      const note = await models.Notes.findOne({ _id });
      if (!note) throw new Error('Note not found');
      return note;
    }
  }
  noteSchema.loadClass(NoteClass);
  return noteSchema;
};

export const loadClasses = (db: Connection) => {
  const models = {} as IModels;
  models.Notes = db.model<Note, INoteModel>('notes', loadNoteClass(models));
  return models;
};
```

Look closely at `const models = {} as IModels`. It's empty when `loadNoteClass` receives it, and that's fine: the static only reads `models.Notes` later, when someone calls it. By then `loadClasses` has filled it in. This is also how one model can call another: `models.Deals` can reach `models.Stages` without any import cycle.

And here's the important part. Each call to `loadClasses` creates a **separate** `models` object, so each customer's statics close over their own. Hold on to that sentence, because the bug hunt at the end of this module is what happens when somebody decides that closure is too much typing.

```compare
--- ✘ Reaches for the global model
class Ticket {
  static getTicket(_id: string) {
    // Which customer's Tickets? This import doesn't know.
    return TicketModel.findOne({ _id });
  }
}
--- ✔ Closes over this customer's models
const loadTicketClass = (models: IModels) => {
  class Ticket {
    static getTicket(_id: string) {
      return models.Tickets.findOne({ _id });
    }
  }
  // ...
};
```

### Why `_id` keys look unscoped

In Relaydesk, your federation keys were compound, `@key(fields: "tenant id")`, because everything shared a database. erxes uses plain `@key(fields: "_id")`, and `__resolveReference` is just `models.Deals.findOne({ _id })`. That isn't careless. The models are already scoped, so an `_id` from another customer simply isn't found.

> [!WARNING] The boundary is only as good as the context
> With per-tenant databases, one wrong `subdomain` is the whole breach. There's no second check in the query. In Relaydesk a mistake usually leaks one filter's worth of data. Here, a process-wide variable holding the wrong models leaks everything until it changes.

## Relaydesk to erxes

Keep this table open for your first few weeks:

| Idea | Relaydesk | erxes |
| --- | --- | --- |
| Customer | `tenant` | `subdomain` |
| Isolation | A field on every document, plus compound keys | Models per subdomain (`useDb`), or one database when self-hosted |
| Mongo statics | Plain models and functions | `loadClass` with a `models` closure |
| Federation entry | `@apollo/gateway` in your own process | Apollo Router binary, composed with `rover` |
| Entity key | `tenant id` | `_id` |
| Who you are | Verified context | A `user` header set by the gateway |
| Plugin calls | Typed tRPC clients | `sendTRPCMessage` by string names |
| Live updates | Not built | Redis pub/sub and `withFilter` |

Most of that table gets its own lesson in this module.

## Versions: you learned newer than they run

This course teaches current major versions, and erxes is one behind on most of them. That's normal in a big codebase, and it means some of what you type from memory will be wrong there. Before you copy anything across, check this:

| Package | You learned | erxes | What'll bite you |
| --- | --- | --- | --- |
| Apollo Client | 4 | 3.11 | Hooks come from `@apollo/client`, not `@apollo/client/react`. `ApolloError` still exists. `useQuery` still takes `onCompleted` |
| Apollo Server | 5 | 4.11 | erxes mounts `expressMiddleware` from `@apollo/server/express4`, which isn't in version 5 |
| Mongoose | 9 | 8.13 | `pre` hooks can still take `next`, and you'll see `new: true` where you'd write `returnDocument: 'after'` |
| Zod | 4 | 3.23 | `z.string().email()` is normal there, and it's deprecated in 4 |
| React | 19 | 18.3 | `ref` isn't a plain prop yet, so you'll see `forwardRef` |
| graphql-subscriptions | 3 | 3 | Same version, but erxes's Redis pub/sub still calls `asyncIterator` |

> [!TIP]
> The rule for your first month: **copy the file next to the one you're changing, not the docs.** When the docs and the code disagree, the code tells you what's running, and the `package.json` tells you which docs to read.

```quiz
Q: You read `models.Deals.findOne({ _id })` in a resolver with no tenant filter. What's the right reaction?
- [ ] It's a cross-tenant leak, so add a subdomain filter
- [x] Check where `models` came from: it should be built for this request's subdomain in the context
- [ ] It's fine, because `_id` values are unique
> The boundary lives in `apolloServerContext`. Global uniqueness of `_id` isn't a security property, and an ID can be guessed or leaked. What protects you is that the query runs against this customer's models.
```

```quiz
Q: Inside `loadClasses`, `models` is an empty object when it's passed to the class loader. Why doesn't that break the statics?
- [ ] Mongoose fills it in during `loadClass`
- [x] The statics only read `models.X` when they're called, and by then the object is full
- [ ] TypeScript's `as IModels` creates the properties
> A closure captures the variable, not a snapshot. `as IModels` only changes what the compiler believes. It does nothing at runtime.
```

Next you'll build this pattern for real, including the part that's easy to get wrong: a static that behaves under concurrent requests.
