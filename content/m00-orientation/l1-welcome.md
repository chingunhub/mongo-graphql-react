---
title: Welcome — the map before the territory
minutes: 8
---

Hey. Before we write a single schema, let's get the shape of the whole thing in your head, because everything in this course hangs off one picture.

When a React app shows you a list of issues, a surprising amount happens: a component asks for data, a client library checks a cache, a request flies over HTTP, a server parses and validates it, a tree of little functions runs, an ODM turns those calls into database commands, and the results climb all the way back up. Junior devs usually know *one* of those layers well. Intermediate devs know where every layer starts and stops — so when something breaks, they know which file to open.

That's the goal here. Step through it:

```viz stack-map
```

Each part of this course zooms into one band of that picture:

| Part | Layer | You'll be able to… |
| --- | --- | --- |
| **I — Mongoose** | Models ↔ MongoDB | design schemas, validate data, query and update efficiently, model relationships, write hooks and aggregations |
| **II — GraphQL & Apollo Server** | HTTP ↔ Resolvers | design a schema, write resolvers that talk to Mongoose, handle auth and errors, kill N+1 queries, paginate |
| **III — Apollo Client & React** | Component ↔ HTTP | query and mutate from React, understand the normalized cache, update it after mutations, paginate, colocate fragments |

## How you'll learn

Every module has the same rhythm:

```viz-flow
{
  colWidth: 200,
  nodes: [
    { id: 'l', label: 'Lesson', sub: 'worked example', col: 0, row: 0, color: 'neutral' },
    { id: 'd', label: 'Drill', sub: 'same idea, new twist', col: 1, row: 0, color: 'neutral' },
    { id: 'f', label: 'Forge step', sub: 'build Taskforge', col: 2, row: 0, color: 'forge' },
  ],
  edges: [
    { from: 'l', to: 'd' },
    { from: 'd', to: 'f' },
  ],
  steps: [
    { focus: ['l'], caption: "**Lessons** explain a concept with an example — usually a little *Bookshelf* app (books, authors, reviews) so the example never spoils the tasks." },
    { focus: ['l>d', 'd'], caption: "**Drills** are small and standalone. Same concepts, different domain, and always one thing the example *didn't* show you. You'll need to think, not copy." },
    { focus: ['d>f', 'f'], caption: "**Forge steps** add a real piece to **Taskforge**, your capstone. Your code carries forward: the models you write in module 1 are the models your GraphQL API uses in module 7." },
  ],
}
```

There are also a couple of 🐞 **bug hunts**: you get code that's broken in a realistic way and have to figure out why. That's the skill you'll use most in a big codebase — far more than writing things from scratch.

## Taskforge

Taskforge is a small issue tracker — think a tiny Linear or Jira. Users, projects with keys like `TF`, issues like `TF-12` with a status, priority, labels and an assignee, and comments. By the end you'll have:

- a **Mongoose** data layer with validation, indexes, hooks, virtual populate and aggregations,
- a **GraphQL API** with modular schema files, auth via tokens, proper error codes, DataLoader batching, cursor pagination and a search union,
- a **React** front end using Apollo Client with cache updates, optimistic UI, fragments and "load more".

And then you'll launch it — your server, your UI — and click around in it. The **⚒ Taskforge** button at the top shows which pieces you've built so far.

There's also a *reference* Taskforge running inside this app right now (the green dot that says **API** up top). Lessons use it for live examples you can edit and run, like this one:

```graphql-try
query {
  projects {
    key
    name
    issueCount
  }
}
```

Don't worry about the syntax yet. Just notice: you asked for exactly three fields, and you got exactly three fields back.

## How the sandbox works

Tasks open in a workbench: the brief on the left, an editor with all the task's files on the right.

- **Run playground** executes `playground.ts` and shows its `console.log` output. Use it freely — it's your scratchpad. Nothing is graded.
- **Submit** runs hidden tests against your code and tells you which pass, with a nudge when one fails.
- You can write **TypeScript or plain JavaScript**. Types are *stripped*, not checked — so a type mistake won't block you, but it won't save you either.
- Code that touches MongoDB runs against a **real MongoDB**, in a fresh throwaway database for every run. You can't break anything. Go wild.
- Your code autosaves. Close the app whenever; it'll be here.
- **Hints** go from gentle to nearly-there, one at a time. The **solution** unlocks after you pass or after three attempts.

> [!TIP] How to get unstuck
> Read the *first* failing test's message carefully — it's usually the one that matters, the rest are often consequences. Then `console.log` in the playground. Then a hint. In that order.

> [!NOTE]
> Files marked **read-only** are provided helpers, like a coworker's code you depend on but don't own. Reading them is encouraged; that's a big-codebase habit too.

Next up: a two-minute warm-up so you can try the workbench.
