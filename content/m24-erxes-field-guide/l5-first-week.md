---
title: 'Your first week in the real repository'
minutes: 35
---

You've written a plugin in the erxes shape, and you've hunted down a bug that only appeared under load. There's one skill left, and no sandbox can grade it: walking into a huge repository with no brief and finding your way around.

This last lesson is a guided walk through real code. There's no task after it, so open your own checkout and follow along. It'll take longer than the lesson's estimate if you do it properly, and that's the idea.

## Getting it running

erxes is an Nx monorepo managed by pnpm, which you met in Module 14. Everything below is from the repository's own `package.json` and `CLAUDE.md`, so check them first in case they've moved on.

```bash
pnpm install
pnpm dev:core-api
```

That starts `core-api` and the `gateway` with `npx nx run-many -t serve -p core-api gateway`. They need MongoDB and Redis running, and a `.env` based on `.env.sample`.

You don't want every plugin running at once, so you pick:

```bash
ENABLED_PLUGINS=sales
```

Then `pnpm dev:apis` starts the enabled backend plugins (the script turns each name into `sales_api`), and `pnpm dev:uis` does the frontends. The ports you'll care about:

| Service | Port |
| --- | --- |
| Gateway | 4000 |
| Core API | 3300 |
| Core UI | 3001 |
| `sales_api` | 3305 |

> [!TIP]
> Don't start by running everything. Start with the one plugin you've been asked about. A smaller system is faster, and the error messages are a lot easier to read.

## A reading recipe

Junior engineers read a codebase like a book, from the top. It doesn't work, because there's too much of it. Instead, **start from something a user does, and follow it one hop at a time.** Each hop answers one question: who calls this, and what does it call?

```viz-flow
{
  title: 'Follow one thing through',
  colWidth: 170,
  rowHeight: 90,
  nodes: [
    { id: 'ui', label: 'What the user sees', sub: 'Text on the screen', col: 0, row: 0, color: 'react' },
    { id: 'gql', label: 'The operation', sub: 'A name to search for', col: 1, row: 0, color: 'gql' },
    { id: 'schema', label: 'The schema', sub: 'Its shape', col: 2, row: 0, color: 'gql' },
    { id: 'res', label: 'The resolver', sub: 'Guards, context', col: 3, row: 0, color: 'forge' },
    { id: 'model', label: 'The model', sub: 'Statics, rules', col: 4, row: 0, color: 'mongo' },
  ],
  edges: [
    { from: 'ui', to: 'gql' },
    { from: 'gql', to: 'schema' },
    { from: 'schema', to: 'res' },
    { from: 'res', to: 'model' },
  ],
  steps: [
    { focus: ['ui', 'ui>gql', 'gql'], caption: 'Search the frontend for a visible word, then find the operation that component uses.' },
    { focus: ['gql', 'gql>schema', 'schema'], caption: 'The operation name is your best search term in a big repository, because it\'s unique and it crosses the frontend and backend.' },
    { focus: ['schema>res', 'res'], caption: 'At the resolver, ask two things: who\'s allowed, and where do the models come from?' },
    { focus: ['res>model', 'model'], caption: 'Business rules live here. This is usually where your change goes.' },
  ],
}
```

## The walk: `salesChecklists`

Open a deal in erxes and there's a checklist. Here's how that data arrives. Do each hop yourself, with your editor's search, before reading on.

### 1. The operation

Searching the sales frontend for checklist code gets you to the document:

```ts title="frontend/plugins/sales_ui/src/modules/deals/graphql/queries/ChecklistQueries.ts"
export const GET_CHECKLISTS = gql`
  query salesChecklists(${commonParams}) {
    salesChecklists(${commonParamDefs}) {
      ${checklistFields}
    }
  }
`;
```

The names are held in variables, which is a local habit. Your search term is `salesChecklists`.

### 2. The hook

`deals/cards/hooks/useChecklists.tsx` is what uses it. Look at what it imports:

- `useQuery` and `useMutation` from `@apollo/client`, because that's version 3
- `useAtom(dealDetailSheetState)` to get `contentTypeId`, the deal that's open in the side sheet

So the question "which deal?" is answered by a **Jotai atom**, and "what's on it?" by **Apollo**. That's the last lesson, in real code. Its mutations use `refetchQueries` with `GET_CHECKLISTS`, so after an update the list comes back from the server, rather than the cache being edited by hand.

### 3. Crossing to the backend

Search `backend/plugins/sales_api` for that name:

```graphql title="backend/plugins/sales_api/src/modules/sales/graphql/schemas/checklist.ts"
salesChecklists(contentTypeId: String): [SalesChecklist]
salesChecklistDetail(_id: String!): SalesChecklist
```

That file is only a piece. `apollo/schema/schema.ts` imports the module's pieces and joins them, and `apollo/resolvers/queries.ts` spreads `...checklistQueries` into `Query`. Those two files are the map of a plugin's API.

### 4. The resolver

```ts title="backend/plugins/sales_api/src/modules/sales/graphql/resolvers/queries/checklists.ts"
async salesChecklists(
  _root: undefined,
  { contentTypeId }: { contentTypeId: string },
  { models }: IContext,
) {
  return models.Checklists.find({ contentTypeId }).sort({ createdAt: 1, order: 1 });
},
```

You can read all of this now. There's no tenant filter, and you know why. `models` comes from the context, so you know where to look. And `sort` has no guaranteed index behind it unless someone added one, which you'd check in the definition.

### 5. The models

`connectionResolvers.ts` lists `models.Checklists`, created with `db.model('sales_checklists', ...)`, so now you know the real collection name for when you're in a Mongo shell. Then `modules/sales/db/models/Checklists.ts` has the `loadCheckListClass` closure you've already built, with `getChecklist` throwing `Checklist not found`. The schema is next door in `db/definitions`.

That's five hops and about ten minutes, and you've got a working picture of a feature in a repository of thousands of files. You didn't need to understand the rest of it.

## Your exercise: what stops a stranger?

Remember the line at the bottom of that resolver file?

```ts
// moduleRequireLogin(checklistQueries);
```

Here's a real investigation, and I don't know the final answer for the version you're holding. Your job is to find out, and to be precise about what you've proved.

1. Is that line still commented out in your checkout?
2. Does anything else guard this resolver? Look at the spread in `apollo/resolvers/queries.ts`, at what `startPlugin` does, and at the gateway's `userMiddleware` and `graphql-limiter`.
3. Is anything else in front of the router: an allowlist, persisted operations, a Rhai script in `apollo-router/rhai`?
4. If you run it locally, what does an anonymous `salesChecklists` query really return? Test it **only on your own local instance**.
5. Write three sentences: what you checked, what you found, and what you didn't check.

That last sentence is the one juniors skip. "I tested it locally on the default config and an anonymous query returned X. I didn't check the production router config" is useful to a senior engineer. "It's a vulnerability!" based on a commented-out line is not, and neither is "it's fine". If you do find something real, take it to the team privately, and never to a public issue.

> [!IMPORTANT]
> The skill here isn't finding the bug. It's knowing exactly how far your evidence goes. That's the same habit as the incident, and the same one as Module 18's timeouts: say what you know, and say what you don't.

## Your first month's habits

Most of this you've done already, and only the names are new:

| When | Habit |
| --- | --- |
| Before changing anything | Find the nearest working example and copy its shape |
| Reading a guard | Read the body, because the name is only a claim |
| Calling `sendTRPCMessage` | Pick a default that fails visibly, and see a real answer come back once |
| Writing a query | Ask where `models` came from |
| Adding a channel | Ask who else hears this name |
| Adding state | Ask who owns it |
| Adding an effect | Ask what closes it |
| Anything from memory | Check it against the version in `package.json` |
| Saying "it works" | Say what you ran, and what you didn't |

And some things that aren't technical at all. Ask questions early, with what you've already tried in the same message. Small PRs get reviewed, while huge ones get skimmed. When you don't know why a strange line exists, `git log -L` or `git blame` will often tell you, so read that before deleting it. There's frequently an incident behind that odd line.

```quiz
Q: You've been asked to fix something on the deal screen, and you've never seen this code. What's the best first move?
- [ ] Read `backend/plugins/sales_api` from the top
- [x] Find the visible text or operation name, and follow it hop by hop
- [ ] Rewrite the screen with patterns you know
> A search term that crosses frontend and backend, usually an operation name, gets you there in minutes. Reading in file order doesn't scale to a repository this size.
```

```quiz
Q: Which is the most useful message to your team?
- [ ] "`salesChecklists` is unprotected"
- [x] "With the default local config, an anonymous `salesChecklists` query returned rows. The guard's commented out. I haven't checked the production router config. Can someone confirm?"
- [ ] "I think auth might be broken somewhere"
> It says what was run, what was seen and where the evidence stops, and it asks a question that someone can answer.
```

## That's the course

Think back to Module 1: a Mongoose schema, and a question about whether your code smelled. Since then, you've built a task tracker end to end, and then a multi-tenant system with a federated graph, service contracts, durable queues, a plugin host and a frontend that tells the truth when things fail. Then you took all of it into the shape of a real product.

The big codebase you were worried about is just a lot of these small pieces. It's models, context, guards, messages, owners, cleanups. You've written each of them by hand, you've broken most of them on purpose, and you've seen what they look like when they fail at 12:09 on a Friday.

You won't understand all of erxes this month. Nobody does, including the people who've worked on it for years. They just know how to find their way through it, one hop at a time. And now, so do you.

> [!NOTE]
> One optional module follows: **Client portals**, the customer-facing side of the same system. Take it when a task at work touches a portal.
