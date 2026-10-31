---
title: "pnpm, Nx and the meaning of an affected build"
minutes: 22
---

The first time you open a big real repo, the root folder looks like a small town: `pnpm-workspace.yaml`, `nx.json`, a `backend` folder, a `frontend` folder, and hundreds of `package.json` files. It's easy to assume that "monorepo" means one big application.

It doesn't. A monorepo arranges **source code and changes**. It says nothing about how many processes run. A repo like this has many services, and each one starts separately.

This lesson gives you the vocabulary to not get lost there. We'll also build one small algorithm you'll need in a minute.

## Three graphs that look the same

People say "the dependency graph" as if there's only one. There are three, and mixing them up causes real confusion:

| Graph | Nodes | An edge means | Who cares |
| --- | --- | --- | --- |
| **Package** | packages | "needs this to resolve an import" | pnpm |
| **Task** | build, test, typecheck | "this must finish first" | Nx |
| **Runtime** | processes, services | "sends requests or messages here" | the gateway, the queue |

Here's a concrete way to see the difference. A `sales` service can import a type from a shared package (package graph) while never calling it over the network. And that same service can call a `core` service over tRPC (runtime graph) while importing nothing from it.

> [!WARNING] A green build proves one graph
> A successful build shows the **package** graph is healthy. It tells you nothing about the **runtime** graph, so "it compiled" doesn't mean the plugin is reachable. Keep those two facts apart when someone says it works.

## See a change travel

This is the workspace from the last lesson with a few more projects. Arrows point from a project to what it imports. Play with it before moving on, because this is the mental picture for the rest of the module.

```viz blast-radius
{}
```

Nx does exactly this walk when you run `nx affected`. It's fast because it re-tests the lit-up projects and skips the rest, with no cleverness about your actual code. The graph alone decides.

## Try the real tools

The Relaydesk page explains how to export the reference project into its own folder. That export has real pnpm workspace metadata and real Nx project files, so you can touch them. In Git Bash, from the exported folder:

```bash
npx pnpm@9.12.3 install
npx pnpm@9.12.3 exec nx show projects
npx pnpm@9.12.3 exec nx graph --file=dependency-graph.html
npx pnpm@9.12.3 exec nx run-many -t typecheck
```

If you've installed pnpm globally, or enabled it through Corepack, a plain `pnpm` works too. The project pins the version in `packageManager`, so everyone gets the same 9.12.3.

`affected` needs two real revisions to compare. Nx has to know what "changed" means:

```bash
npx pnpm@9.12.3 exec nx affected -t typecheck --base=HEAD~1 --head=HEAD
```

> [!WARNING] A green empty run proves nothing
> On a fresh export with one commit, `HEAD~1` doesn't exist. Make two commits first. And read what actually ran: "0 tasks succeeded" is green, and it's also zero coverage.

## Why a cache can lie

Nx caches task results. A cache stores outputs under a fingerprint of the **inputs**, so if the inputs match, it replays yesterday's output.

Suppose codegen generates TypeScript types from a GraphQL schema, but the task only declares `.ts` files as inputs. You add a field to the schema. Nx sees no input changes, replays the old output, and your new field doesn't exist. Nothing is broken in Nx. You gave it an incomplete list.

```compare
--- ✘ Inputs that miss the schema
"codegen": {
  "cache": true,
  "inputs": ["{projectRoot}/**/*.ts"]
}
// schema.graphql changes -> same fingerprint -> stale types
--- ✔ Every input that affects the output
"codegen": {
  "cache": true,
  "inputs": [
    "{projectRoot}/**/*.ts",
    "{projectRoot}/**/*.graphql",
    "{projectRoot}/codegen.ts"
  ]
}
// any of these change -> new fingerprint -> task reruns
```

Disabling the cache makes the symptom go away and teaches you nothing. Fix the input list.

```quiz
Q: A codegen task is cached after a GraphQL schema change, but the output types are old. What should you inspect first?
- [ ] Whether the machine needs a restart
- [x] Whether schema files are part of the task's inputs
- [ ] Whether all tasks can run in one process
> A cache is only correct when every input that affects the output is in its fingerprint. Turning caching off can confirm the diagnosis, but it doesn't fix the contract.
```

One more thing while we're here. A version range in `package.json`, like `^5.40.0`, is a rule. It isn't a fixed set of packages. The **lockfile** records exactly what got installed, which is why `pnpm-lock.yaml` belongs in version control. The Academy itself stays on npm; pnpm lives only in the exported Relaydesk.

## Building things in the right order

Time for the algorithm. Relaydesk has plugins, plugins can need other plugins, and you can't start one before the things it needs. That's a **build order**, and the classic way to get one is a depth-first walk: visit everything a node needs, *then* add the node.

Here's a simple version for a list of kitchen steps:

```ts
// @worked-example boot-order
type Steps = Record<string, string[]>;

export function bootOrder(steps: Steps): string[] {
  const done = new Set<string>();
  const order: string[] = [];

  function visit(name: string) {
    if (done.has(name)) return; // already ordered, nothing to do
    done.add(name);
    for (const need of steps[name]) visit(need);
    order.push(name); // everything it needs is already in the list
  }

  for (const name of Object.keys(steps)) visit(name);
  return order;
}

console.log(bootOrder({ serve: ['cook'], cook: ['chop', 'boil'], chop: [], boil: [] }));
// ['chop', 'boil', 'cook', 'serve']
```

The key line is `order.push(name)` **after** the loop. Trace `serve`: it visits `cook`, which visits `chop` and `boil`, and those are pushed first. `done` also handles the diamond case. If two steps both need `chop`, the second visit returns right away, so `chop` appears once.

Now try to break it. What does this print for a cycle?

```ts
bootOrder({ a: ['b'], b: ['a'] });
```

It happily returns `['b', 'a']`. Our code says `b` starts before `a`, and that's false, because `b` needs `a`. `done` can't tell these two situations apart:

- "I finished that node earlier" (fine, a diamond)
- "I'm **still in the middle of** that node" (a cycle)

Those need different bookkeeping. That's the catch for your next task.

```quiz
Q: In a depth-first build order, why is a node pushed after its dependencies are visited, not before?
- [x] So everything it needs is already in the list when it's added
- [ ] Because arrays are faster when you push at the end
- [ ] To make the result alphabetical
> Pushing last gives you the guarantee you wanted: every dependency comes before its consumer.
```

```quiz
Q: Your registry finds a plugin missing at startup. Should it skip that plugin and boot the rest?
- [ ] Yes, partial service is always better than none
- [x] No, fail with a precise error while the cause is still obvious
- [ ] Yes, but log a warning
> A skipped plugin shows up later as an unrelated-looking failure in the middle of a request, far from the cause. Failing at startup keeps the error next to the mistake.
```

## Relaydesk's first rule

Every enabled plugin needs a unique name, a supported contract version, and a dependency path that actually ends. That's next: your first Relaydesk file, and everything else in the project stands on it.

In bigger systems the same worry shows up differently: each service registers itself when it starts, and the gateway composes whatever is reachable. We'll get there. For now, the small version in the next task teaches the same lesson.
