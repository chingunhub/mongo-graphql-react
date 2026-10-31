---
title: Your first week in a real repo
minutes: 15
---

You've just finished a real backend, and the whole thing fits in your head. A real repo won't.

Day one tends to go like this. You clone it, and there are forty folders. There's a build tool you've never heard of. The README's setup steps fail on step three. Someone hands you a ticket full of words that mean nothing to you yet, and you quietly wonder whether you were ever a developer at all.

Almost everyone feels this, and it's why so many people give up right here. They think the repo is telling them they aren't good enough, when really it's only telling them they're new. Nobody can read a repo that size. The people who look comfortable in it have just learned how to work without reading all of it.

That's what this lesson is about. There's no task after it, because no sandbox can grade it. Come back to it on the day you need it.

## What changes, and what doesn't

Put Taskforge next to a big production repo and the difference looks huge:

| | Taskforge | A real repo |
| --- | --- | --- |
| Models | A handful | Hundreds |
| Authors | You | Dozens, and some left years ago |
| Code you've read | All of it | A small slice, for as long as you work there |
| Consistency | One style | Several styles, from different years |

But look at what stays the same. A client still sends an operation. A schema still says what's allowed. A resolver still receives it, something still checks permissions, and something still talks to the database. The folders have different names and there are more of them, but a request travels the same road you've just built by hand.

That's the real gift of building every layer yourself. You already know what you're looking for, so you only have to find where this repo keeps it.

## Three goals for week one

Keep this list small on purpose:

1. **Get it running** on your machine.
2. **Get one small change merged.** A typo counts. So does a fixed README line.
3. **Find out who to ask** about what.

Notice what isn't on the list: understanding the architecture. You'll get that from doing real changes over months, and trying to study it up front is how people spend a week reading and remember none of it.

## Getting it running

When the README fails, and it will, work through these in order:

```viz-flow
{
  colWidth: 170,
  nodes: [
    { id: 'readme', label: 'README', sub: 'the intention', col: 0, row: 0, color: 'neutral' },
    { id: 'scripts', label: 'package.json', sub: 'the real commands', col: 1, row: 0, color: 'forge' },
    { id: 'env', label: '.env example', sub: 'what it needs', col: 2, row: 0, color: 'forge' },
    { id: 'ci', label: 'CI config', sub: 'a working recipe', col: 3, row: 0, color: 'mongo' },
  ],
  edges: [
    { from: 'readme', to: 'scripts' },
    { from: 'scripts', to: 'env' },
    { from: 'env', to: 'ci' },
  ],
  steps: [
    { focus: ['readme'], caption: "**The README** says how setup was meant to work, on the day someone last updated it. Start here, but don't trust it blindly." },
    { focus: ['readme>scripts', 'scripts'], caption: "**The `scripts` in `package.json`** are what people actually run. If everyone starts the app with `pnpm dev:api`, it's in there, even if the README says something else." },
    { focus: ['scripts>env', 'env'], caption: "**`.env.example`** (or `.env.sample`) lists the settings the app expects, which also tells you what it depends on. A `REDIS_URL` line means you need Redis running." },
    { focus: ['env>ci', 'ci'], caption: "**The CI config**, often in `.github/workflows`, is the secret weapon. It has to set the project up on an empty machine on every push, so if tests are passing there, it's a recipe that works today." },
  ],
}
```

Two habits make this go better. First, keep a notes file with every command that worked and every error you hit, because you'll need them again next month. Second, if the README was wrong, fix it. You've just found something every new person trips over, and that's your first pull request.

If you can start one service instead of all of them, do that. A smaller system starts faster, and its errors are much easier to read.

> [!TIP]
> Set a limit. If setup has you stuck for about an hour, ask. Nobody expects you to guess a missing environment variable, and the answer is often something only the team knows.

## Follow one path

Earlier in this module you learned to trace a behavior from the operation down to the data. In a big repo, that's how you read. You pick one thing that actually happens, follow it from end to end, and ignore everything beside it.

Here's that path through code you wrote. Open the **⚒ Taskforge** page and follow along:

```viz-flow
{
  colWidth: 200,
  rowHeight: 72,
  nodes: [
    { id: 'schema', label: 'schema/issue.ts', sub: 'createIssue', col: 0, row: 0, color: 'gql' },
    { id: 'res', label: 'resolvers/issue.ts', sub: 'createIssue', col: 0, row: 1, color: 'gql' },
    { id: 'perm', label: 'services/permissions.ts', sub: 'may this user write?', col: 1, row: 1, color: 'forge' },
    { id: 'model', label: 'models/Issue.ts', sub: 'createInProject', col: 0, row: 2, color: 'mongo' },
  ],
  edges: [
    { from: 'schema', to: 'res' },
    { from: 'res', to: 'perm', dashed: true },
    { from: 'res', to: 'model' },
  ],
  steps: [
    { focus: ['schema'], caption: "**Start with the name.** Search the repo for `createIssue`. The schema tells you the input and what comes back." },
    { focus: ['schema>res', 'res'], caption: "**Find the resolver.** The same search finds it. Read only this function, not the whole file." },
    { focus: ['res>perm', 'perm'], caption: "**Take the side trip only if you need it.** The name says this checks permissions. If your ticket isn't about permissions, trust the name and move on." },
    { focus: ['res>model', 'model'], caption: "**Reach the data.** Now you know the whole path, and you never opened a single unrelated file." },
  ],
}
```

In a real repo the same path has more stops: a gateway, a shared package, perhaps a service in another folder. It's still one hop at a time. Write each hop down as you go, with the file and function. By the end you have a small map of your own, which is worth more than any architecture diagram that's two years old.

To find where a path starts, search for something exact:

- **Text on the screen.** A button label or a heading usually appears in the code once or twice.
- **The exact error message.** Copy it in full. It's a string in a file somewhere.
- **The operation name**, which your browser's network tab shows you.
- **A field name**, to see everywhere it travels.

Then let your editor do the walking, with **Go to definition** and **Find all references**.

## Let history explain the code

You'll often find code that looks wrong, and it's tempting to fix it. Before you do, find out why it's there. Git remembers:

```bash
# What changed in this file, newest first
git log --oneline -- server/services/permissions.ts

# Who last touched each line, and in which commit
git blame server/services/permissions.ts

# Which commits added or removed this string
git log -S"assertCanWriteProject" --oneline
```

Despite the name, `git blame` isn't for blaming anyone. It leads you to the commit, the commit leads you to the pull request, and the pull request often explains the odd-looking line. It also tells you who knows this code, which handles goal three.

Recent merged pull requests are even better. Find one that did something like your ticket, and you get a recipe: which files changed, what the tests looked like, and what reviewers pushed back on.

Tests help the same way. The test next to a function shows you how it's meant to be called and what the author cared about, and it's usually easier to read than the code. Run just that one test while you work, not the whole suite.

## Copy the nearest neighbor

Your first few tasks will nearly all be something the repo already does somewhere else. So find that place first.

Say you're asked to add an `estimate` field to issues in Taskforge. You don't have to design anything. Search for `priority`, a field that already exists on the same type, and every result is a place you may need to touch. Go through them one at a time, and you've got your list of changes before writing a line.

The same goes for style. Match the file you're in, even if you'd have done it differently. A new person with strong opinions about naming is tiring for everyone, while someone whose code looks like the code around it gets through review quickly. You can have opinions in a few months, once you know why things are the way they are.

> [!WARNING]
> Check that your neighbor isn't retired. Big repos often hold an old way and a new way side by side. Run `git log` on the file you're copying, and ask if you're not sure which way is current.

## Asking a good question

Being stuck in silence for two days is worse than asking too early. It's also worse than asking badly, which is easy to fix. Spend a real attempt first, then write down four things:

```text
I'm trying to: add an estimate field to issues.
I expected: it to come back in the issue query.
What happened: "Cannot query field estimate on type Issue".
I've tried: adding it to the model and restarting.
My question: is the schema generated somewhere, or do I edit it by hand?
```

Half the time, you'll spot the answer while you're writing this out. The other half, you've given someone a question they can answer in thirty seconds, instead of "it doesn't work, can you look?", which costs them half an hour.

## Your first pull request

Keep it small. One change, for one reason, is much easier to review, so it gets merged sooner, and getting one merged teaches you the whole process: branch names, checks, how review works here.

Before you ask for review, read your own diff as if someone else wrote it. You'll usually catch a stray `console.log`. Run the tests and the linter, then write down what changed, why, and how you checked it.

Then expect comments. Everybody gets them, including the seniors, and they're about the code, not about you. Each one teaches you something about this repo that no course could.

## Check yourself

```quiz
Q: The README's setup steps fail on a fresh clone. Where's the most reliable place to look next?
- [ ] The oldest folder in the repo, since it holds the original setup
- [x] The CI config, because it has to set the project up on an empty machine on every push
- [ ] The `dist` folder, because it shows what the build produces
> CI runs from nothing every time, so while it's passing, it's a setup recipe that works today. `package.json` scripts and the `.env` example are good places to look too.
```

```quiz
Q: A ticket says the Archive button on the settings page shows "Not allowed" for some users. What's the quickest way in?
- [ ] Read the `server` folder from top to bottom until you reach permissions
- [ ] Ask for an architecture walkthrough before you touch anything
- [x] Search for the exact text "Not allowed" and the button's label, then follow one path from there
> Exact strings are the fastest doors into a repo. They take you straight to the code involved, and from there it's one hop at a time.
```

```quiz
Q: You're asked to add a new field to a type that already has plenty of fields. What should you do first?
- [ ] Design the cleanest possible approach, then write it
- [x] Find a similar field and search for everywhere it appears
- [ ] Read every resolver in the repo so you don't miss anything
> The existing field shows you every place a field has to go in this repo, and how the team writes it.
```

## Where this leaves you

You don't need to finish this course before you walk into a real repo. You've got something better than a list of facts: you've built every layer, so you know what each one is for. The rest takes time and patience, and everyone goes through it.

If you continue to Stage 3, Module 24 walks through a large open-source repo using these same habits. For now, the next time a big repo makes you feel lost, remember that it's just the road you've already built, with more stops on it.
