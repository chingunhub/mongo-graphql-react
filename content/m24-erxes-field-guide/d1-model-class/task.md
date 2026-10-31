---
title: "Drill: a model class per subdomain"
kind: drill
db: true
focus: ['connectionResolvers.ts', 'db/models/Tickets.ts']
readonly: ['db/definitions/tickets.ts']
---

Almost every backend file you'll open in erxes sits on top of this structure, and you can't find anything until you can see it. So build a small one yourself: a schema, a class of statics, and a function that hands out one set of models per organization.

There's one upgrade on the original. erxes trusts the subdomain it receives, and yours has to check it.

## Your task

### 1. `databaseName(subdomain)` in `connectionResolvers.ts`

A subdomain must match `^[a-z0-9-]{1,20}$`. Otherwise, throw `Invalid subdomain`. Return `` `${mongoose.connection.name}_${subdomain}` ``.

### 2. `loadTicketClass(models)` in `db/models/Tickets.ts`

Add these statics, using the `models` argument rather than anything global. Then attach the class with `loadClass`.

| Static | Behavior |
| --- | --- |
| `getTicket(_id)` | Returns the ticket, or throws `Ticket not found` |
| `createTicket(doc)` | Creates it. If that `sourceId` already exists, returns the existing ticket, even in a race |
| `closeTicket(_id)` | Closes an open ticket and returns it. Throws `Ticket already closed` or `Ticket not found` |

Only one of two simultaneous `closeTicket` calls may succeed.

### 3. `loadClasses(db)` and `generateModels(subdomain)`

`loadClasses` builds `{ Tickets }` on the given connection, with the model named `tickets`.

`generateModels` gets the subdomain's connection using `useDb` with `useCache: true`, waits for the indexes to be ready, and returns the models. It runs on every request, so repeated and concurrent calls for one subdomain must return the **same** models object.

```ts
const north = await generateModels('north');
const south = await generateModels('south');

const ticket = await north.Tickets.createTicket({ sourceId: 'mail-1', subject: 'Printer' });
await south.Tickets.getTicket(ticket._id); // throws Ticket not found
```

## Hints

### Why does the second request crash?
Run `generateModels` twice and read the error. Mongoose won't compile the same name twice on one connection. What could you remember between calls?

### Two callers at once
If two requests arrive together, both miss your cache. What could you store *before* any `await` happens?

### Which `models`?
Picture North and South both loaded. If a static reads a variable at module level, which organization does it see?

### Closing with one winner
You've solved this problem with ticket versions. Can the update's filter carry the condition?
