---
title: "Bug hunt: the empty roster"
kind: bughunt
db: true
summary: A support ticket, a small codebase, and three bugs that don't throw errors.
focus: [services/roster.ts, models/Team.ts, models/Player.ts, playground.ts]
needs: [m04/l1-embed-or-reference, m04/l2-virtuals]
---

You've just joined the team that runs a sports league app. Your first ticket:

> **TICKET-4512 — Team page broken** (priority: high)
>
> Since the "roster" refactor last sprint:
> 1. Every team page says **"No players yet"**, even for teams that definitely have players.
> 2. QA added players by hand to test — the list showed up in the DB, but the **captain badge** never appears for anyone.
> 3. The frontend says the team **id is missing** from the roster response, so the "edit team" link goes to `/teams/undefined`.
>
> No errors in the logs.

"No errors in the logs" is the important part. These are the bugs that survive code review and reach production: everything *runs*, it's just wrong.

## Your task

Find and fix the bugs so `getRoster(teamId)` in `services/roster.ts` returns:

```ts
{
  id: '66f1…',            // the team id as a string
  name: 'Harbor Hawks',
  players: [              // sorted by shirt number
    { id: '66f2…', name: 'Ines', number: 4, isCaptain: false },
    { id: '66f3…', name: 'Theo', number: 7, isCaptain: true },
  ],
}
```

…or `null` for an unknown team. Don't rewrite the files from scratch — find what's wrong and make the smallest fix that's correct. That's how you'd do it in a real codebase, where a rewrite means a big diff someone has to review.

Use the playground. A good debugging habit: **log the raw data at each step** (`console.log(team)` right after the query) before guessing.

## Hints

### Symptom 1: no players
Players store `player.team`. The team gets its players through a virtual populate. Read the virtual's definition out loud as a sentence: "players are the Players whose ___ equals my ___". Does it make sense?

### Symptom 2: no captain badge
How is "is this player the captain" decided? What are the *types* of the two values being compared, and what does `===` do with two objects?

### Symptom 3: missing id
The query ends with `.lean()`. What does a lean object have, and what doesn't it have, compared to a Mongoose document? Either fix works: stop using lean, or build the id from something lean objects *do* have.
