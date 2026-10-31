---
title: "A request crosses owners"
minutes: 20
---

> [!NOTE]
> This is Stage 3. It is hard on purpose and no one needs all of it, so take the modules you need, when you need them. You can start it without Stage 2, though the opening below assumes you finished Taskforge, and the later React modules ask for what Stage 2 teaches.

You finished Taskforge. Take a second with that, because you built every layer of a real application yourself. When something broke, you knew where to look: you wrote it.

Real jobs take that comfort away. You open a repository where five teams own different parts of one request, and you've read about four percent of the code. Searching for a resolver is easy. Knowing **which module is allowed to change** is the hard part, and that's what the rest of this course trains.

So here's the deal for Part IV. We start a second project, **Relaydesk**: a support desk where several organizations share one system, with tickets, contacts, an activity feed and an operations console. It's split into services, the way many real systems are. Each module adds one thing that goes wrong in a connected system, and you'll make it go wrong on purpose before you fix it.

This first module is a gentle on-ramp. No database, no GraphQL. Just dependency graphs and small pure functions, because everything later leans on this one idea.

## The bug nobody touched

A library has a Reservation screen that shows a book's author. Reservations is one team's code, Catalogue is another's. Here are two ways Reservations could get that author:

```compare
--- ✘ Reach into another team's model
// reservations/service.ts
import { Book } from '../catalogue/models/Book';

const book = await Book.findById(reservation.bookId);
return { ...reservation, author: book.authorName };
// ✔ one line, no ceremony
// ✘ depends on catalogue's private field names
// ✘ depends on catalogue's indexes and connection
// ✘ Catalogue can't rename authorName without breaking you
--- ✔ Ask through a published contract
// reservations/service.ts
import type { CatalogueApi } from '@library/contracts';

const book = await catalogue.bookSummary(reservation.bookId);
return { ...reservation, author: book?.author ?? 'Unknown' };
// ✔ Catalogue may reorganize anything behind bookSummary
// ✔ "no such book" is a designed answer (null)
// ✘ one more thing to define and keep compatible
```

The left version compiles today. Then Catalogue splits `authorName` into `authors[]` during a migration. Their tests pass, because they updated their own code. Reservations didn't change a single line, and reservations are broken in production.

A **boundary** is a promise about what other code may depend on. The promise might be a TypeScript interface, a GraphQL field, an event envelope or a tRPC procedure. Everything behind the promise is free to move. A good one says what failure means too, not only what success returns.

```viz-sequence
{ title: 'Who owns the answer?', actors: [ { id: 'ui', label: 'Reservation UI', color: 'react' }, { id: 'r', label: 'Reservations', color: 'gql' }, { id: 'c', label: 'Catalogue', color: 'mongo' } ], steps: [ { from: 'ui', to: 'r', label: 'reservation(id)', note: 'The screen asks for a reservation. It has **no idea** which database holds what.' }, { from: 'r', to: 'c', label: 'bookSummary(bookId)', note: 'Reservations knows the public contract. It never sees the catalogue collection layout.' }, { from: 'c', to: 'r', label: 'book or null', ret: true, note: 'A deleted book is a designed answer. A timeout is a **different** failure, and the contract keeps them apart.' }, { from: 'r', to: 'ui', label: 'reservation + author', ret: true, note: 'If the author is wrong, you can now name the owner that supplied it. **That** is what the boundary buys you.' } ] }
```

## Arrows point one way, questions go both ways

We'll draw lots of dependency graphs, so let's agree on what an arrow means. Write **A → B** when A imports B. A depends on B.

That single arrow answers two opposite questions:

| Question | Walk | Example |
| --- | --- | --- |
| What must exist before A builds? | **follow** the arrows | build B first |
| What might break if B changes? | walk **against** the arrows | re-test A |

Mixing these up is the classic mistake. Here's a tiny workspace: `screen → reservations → contracts`, and `catalogue → contracts`.

If `reservations` changes, you re-test `reservations` and `screen`. Catalogue is untouched, even though both use `contracts`, because a change only travels **toward the things that import it**. If `contracts` changes, all four might break.

Here's the smallest useful version of that walk. It finds **direct** consumers only, one hop out:

```ts
// @worked-example direct-consumers
export type Graph = Record<string, string[]>;

export function directConsumers(graph: Graph, project: string): string[] {
  return Object.keys(graph)
    .filter((name) => graph[name].includes(project))
    .sort();
}

const graph: Graph = {
  screen: ['reservations'],
  reservations: ['contracts'],
  catalogue: ['contracts'],
  contracts: [],
};
console.log(directConsumers(graph, 'contracts'));
// ['catalogue', 'reservations']
```

Notice what it gets wrong. Ask about `contracts` and it says `catalogue` and `reservations`, but `screen` imports `reservations`, so it can break too. One hop isn't enough. Keep that in mind for the drill coming up.

```quiz
Q: screen depends on reservations; reservations depends on contracts. Only reservations changed. Which projects are affected?
- [ ] reservations and contracts
- [x] reservations and screen
- [ ] all projects in the repository
> A change travels to consumers. contracts doesn't import reservations, so nothing about it can have broken. (Runtime integration can justify extra tests beyond the static graph, but that's a deliberate choice, and we'll come back to it.)
```

## What to do when you're lost in a big repo

You'll be tempted to read the codebase top to bottom. Please don't, nobody has ever finished. Build a map **around one behavior** instead:

1. **Capture one real case.** A specific input and the wrong output you saw.
2. **Find the public operation** and who owns it.
3. **Follow the calls** until you hit the source of truth.
4. **Write down each crossing**: identity, input, output, failure.
5. **Find the smallest test** that reproduces the broken promise.

Step 4 is the one people skip, and it's where bugs hide. "Tickets calls Contacts" tells you nothing. "Tickets sends `{tenant, id}` and treats null as a deleted contact" tells you what to check.

```viz-flow
{
  title: 'A map around one behavior',
  colWidth: 200,
  rowHeight: 92,
  nodes: [
    { id: 'case', label: 'One wrong output', sub: 'real input, real result', col: 0, row: 0, color: 'forge' },
    { id: 'op', label: 'Public operation', sub: 'who owns it?', col: 1, row: 0, color: 'gql' },
    { id: 'hop', label: 'Next crossing', sub: 'identity · input · output · failure', col: 2, row: 0, color: 'gql' },
    { id: 'truth', label: 'Source of truth', sub: 'who stored this?', col: 2, row: 1, color: 'mongo' },
    { id: 'test', label: 'Smallest failing test', sub: 'pins the broken promise', col: 1, row: 1, color: 'forge' },
  ],
  edges: [
    { from: 'case', to: 'op' },
    { from: 'op', to: 'hop' },
    { from: 'hop', to: 'truth' },
    { from: 'truth', to: 'test' },
  ],
  steps: [
    { focus: ['case'], caption: 'Start from evidence. "Reservations are flaky" is not a starting point; "reservation r7 shows author Unknown" is.' },
    { focus: ['op', 'case>op'], caption: 'Find the public operation. In GraphQL that is a field; in a queue it is a job name.' },
    { focus: ['hop', 'op>hop'], caption: 'Write the contract at every crossing. Repeat this step as many times as there are hops.' },
    { focus: ['truth', 'hop>truth'], caption: 'Stop when you reach the code that actually stored or computed the value.' },
    { focus: ['test', 'truth>test'], caption: 'Now you know enough to write one small failing test. Fix it from there.' },
  ],
}
```

> [!NOTE] Landmarks in a real repo
> The same loop works on a real repository. Look for the gateway that routes traffic, the core service that holds shared data, one folder per service, and the shared toolkit they all use. Careful, though: living under `backend/` doesn't make something a GraphQL subgraph. Some of it is workers.

```quiz
Q: A teammate says "the sales plugin is broken, I'll start by reading through backend/plugins/sales_api". What's the better first move?
- [ ] Read it anyway, you'll need the whole picture eventually
- [x] Get one failing input and output, then follow that single operation
- [ ] Run the entire test suite and read every failure
> A map around one behavior gets you an answer. The whole plugin gets you a tired afternoon. You'll expand the map only when the evidence sends you somewhere new.
```

## What's next

The next drill is a publishing toolchain, with a graph like the one above. Work out what's affected by hand before you run anything, and remember what went wrong with `directConsumers`.

After that, Relaydesk gets its first file: a plugin registry that rejects impossible dependencies at startup, while the error message is still easy to understand.
