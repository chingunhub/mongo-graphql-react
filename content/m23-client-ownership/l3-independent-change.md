---
title: 'Your first change with no brief'
minutes: 45
---

Every task so far has told you which file to open. Real work doesn't. A message arrives, usually vague, and finding the files **is** the job.

So this lesson is different. There's no test suite, no starter and no Submit button. Nobody's marking it but you, and that's the point: the skill you're practicing is knowing when your own work is finished.

Do it in an export of your own Relaydesk. Open the project page, export your workspace, and work there in a real editor.

## The request

Here it is, written the way it would really arrive:

> Agents in big orgs are drowning. Can we let them filter the inbox by priority? High-priority only would be a huge help.

That's the entire brief. The next sections help with the method, not the answer.

## Before you touch anything

Spend ten minutes, and write down your predictions:

1. Which files will change? List them.
2. Which contracts does this cross? What else consumes each one?
3. What could go wrong with tenants?
4. How will you know it worked? Name the rung of the evidence ladder for each claim.

Keep that list. Comparing it with what really happened is the most valuable step in this whole exercise. Where your guess was wrong, your mental model of the project was wrong, and now you know where.

```viz-flow
{
  title: 'A vertical change crosses every layer',
  colWidth: 170,
  rowHeight: 92,
  nodes: [
    { id: 'schema', label: 'Public schema', sub: 'what clients may ask', col: 0, row: 0, color: 'gql' },
    { id: 'sub', label: 'Owning subgraph', sub: 'where the rule lives', col: 1, row: 0, color: 'gql' },
    { id: 'db', label: 'Query + index', sub: 'still tenant-scoped', col: 2, row: 0, color: 'mongo' },
    { id: 'op', label: 'Operation', sub: 'and generated types', col: 0, row: 1, color: 'react' },
    { id: 'cache', label: 'Apollo cache', sub: 'args change the key', col: 1, row: 1, color: 'react' },
    { id: 'ui', label: 'Controls', sub: 'all five view states', col: 2, row: 1, color: 'react' },
  ],
  edges: [
    { from: 'schema', to: 'sub' },
    { from: 'sub', to: 'db' },
    { from: 'schema', to: 'op', dashed: true },
    { from: 'op', to: 'cache' },
    { from: 'cache', to: 'ui' },
  ],
  steps: [
    { focus: ['schema', 'schema>sub', 'sub', 'sub>db', 'db'], caption: 'Start with the contract and work down. Ask what happens to an invalid value at each level.' },
    { focus: ['schema>op', 'op', 'op>cache', 'cache'], caption: 'Your existing mutations refetch one query. Which variables does that refetch use now?' },
    { focus: ['cache>ui', 'ui'], caption: 'An empty filtered result and an empty inbox are different sentences to a user.' },
  ],
}
```

## The questions a reviewer will ask

Work through these before you call it done. You don't need to know them all in advance, and some of them have more than one good answer:

| Area | Question |
| --- | --- |
| Contract | Is the argument optional? What do old clients see? |
| Type | `priority` is a `String` in the schema. Should the filter accept any string? |
| Tenant | Can a filter ever widen what a caller sees? Prove it can't |
| Scale | Does the query still use an index in a big tenant? |
| Client | After "Raise priority" while filtering by low, what should the list do? |
| Cache | Does each filter value get its own entry? Is that what you want? |
| UI | Which message does an empty filtered list show? How does an agent get out of it? |
| Docs | Which generated file changed, and did you read the diff? |

## The rubric

Score yourself honestly, once you've finished. A real reviewer would look for these:

| Criterion | Exceptional | Not there yet |
| --- | --- | --- |
| Scope | Changes only what the feature needs | Unrelated "while I was there" edits |
| Isolation | A regression test proves two tenants stay separate | "It's in the filter, so it's fine" |
| Contract | Valid values are enforced, and old clients still work | Any string gets through, or an old query breaks |
| Index | You looked at an `explain()`, and made a decision | You assumed |
| UI states | Loading, failed, empty and filtered-empty are all truthful | One shared message |
| Evidence | Each claim names the rung that proved it | "Tests pass" |

## Write the change note

This goes with every real change. Keep it short, as you would for a PR:

| Section | Answer |
| --- | --- |
| What | One sentence, for a user |
| Prediction | What you expected to change, and what surprised you |
| Tradeoff | One decision, and the alternative you rejected |
| Evidence | The tenant test, the UI check and the commands you ran |
| Uncertain | What you didn't verify |

"I don't know how this behaves with a million tickets, and I didn't test it" is a strong sentence for a change note. It's what lets the next person trust everything else you wrote.

> [!TIP]
> Want a second opinion? Paste your diff and change note into a review tool or to a colleague, and ask them to attack the tenant isolation specifically.

```quiz
Q: Filtering is added to the public schema and the UI, and all your tests pass. What's the strongest next step?
- [ ] Add another feature while you're in the code
- [x] Compare your prediction with the real diff, and add a test proving that a filter can't cross tenants
- [ ] Mark it done, since the tests are green
> A prediction that was wrong shows you where your model of the system was wrong. And a tenant test turns a belief into evidence.
```

## You've built a system

Take a moment to look at what's behind you. You've got a federated graph, with tenant isolation that survives concurrent requests. You've got durable intake, an idempotent worker, recovery that's the same as normal operation, and a client that won't show one organization's data to another.

More importantly, you can say what each of those guarantees covers, and what it doesn't. That's what makes someone safe to give access to a big codebase.

The next module takes all of this and walks you into the real thing.
