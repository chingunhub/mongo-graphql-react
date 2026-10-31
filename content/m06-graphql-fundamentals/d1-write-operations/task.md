---
title: "Drill: write the operations"
kind: drill
summary: Variables, nested selections, aliases, fragments and a mutation — written against a real schema.
focus: [operations.ts, api/schema.ts, playground.ts]
readonly: [api/schema.ts]
needs: [m06/l1-what-is-graphql]
---

Before writing servers, get fluent at *talking* to one. `api/schema.ts` contains a small **Mission Control** API (in-memory, already implemented). Read its SDL at the top of the file — reading a schema to figure out what you can ask for is a skill you'll use every day.

## Your task

In `operations.ts`, write five GraphQL operations as strings. Each must be **named** exactly as below, use **variables** for every value that changes (no hard-coded ids or statuses), and select **exactly** the fields asked for — the tests compare responses with `toEqual`, so extra fields fail too.

1. **`MISSIONS_BY_STATUS`** — query `MissionsByStatus` with a **required** variable `$status`. Returns `missions` with that status, selecting `name` and `launchYear`.

2. **`MISSION_DETAIL`** — query `MissionDetail($id)`: one mission's `name` and `status`, its `rocket`'s `name` and `reusable`, and its `crew`'s `name` and `role`.

3. **`COMPARE_MISSIONS`** — query `CompareMissions` with two id variables `$a` and `$b`. Fetch both missions in one request, under the response keys **`first`** and **`second`**, each with `name` and `launchYear`.

4. **`MISSION_CREW`** — query `MissionCrew($id)`: the mission's `name`, its `commander` and its `crew`. For both commander and crew members select `name`, `role` and `nationality` — via **one fragment named `CrewMember`** used in both places.

5. **`ADD_ASTRONAUT`** — mutation `AddAstronaut` taking one variable `$input` (look up its input type in the schema). Return the new astronaut's `id`, `name` and `role`.

Use **Run** to try your operations — the playground executes them against the API and prints the results.

## Hints

### Finding the types for variables
Variable types must fit the argument types in the schema, including `!`. `missions(status: MissionStatus)` accepts a nullable status, but the brief asks for a **required** variable — a `MissionStatus!` variable may be passed to a nullable argument. For `mission(id: ID!)`, the variable must be `ID!`.

### Two of the same field
Without aliases, `mission(id: $a)` and `mission(id: $b)` would both want the response key `mission` — a conflict. `first: mission(id: $a) { … }` renames it.

### Fragments
`fragment CrewMember on Astronaut { name role nationality }` goes in the same string, after the query. Spread it with `...CrewMember` wherever an `Astronaut` is selected.
