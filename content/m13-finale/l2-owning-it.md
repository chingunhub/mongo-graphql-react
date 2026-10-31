---
title: When the code is yours
minutes: 7
---

Every forge step so far came with a spec, a file list and tests that told you when to stop. Real work doesn't. A message says "the board is wrong", or a product manager writes three lines, and the rest is on you.

There's no new library in this lesson. It's about how to work when nobody hands you the file list, and the two tasks after it are where you practise.

## A bug report is a symptom

The most common debugging mistake is opening the code first. You read for ten minutes, something looks suspicious, you change it, and the report may or may not be gone. Now you've got a change you can't explain, attached to a bug you never actually saw.

Work the other way around:

```viz-flow
{
  title: 'From a report to a fix you can defend',
  colWidth: 170,
  rowHeight: 74,
  nodes: [
    { id: 'see', label: 'Reproduce', sub: 'make it fail on demand', col: 0, row: 0, color: 'forge', w: 150 },
    { id: 'narrow', label: 'Narrow', sub: 'which layer is wrong?', col: 1, row: 0, color: 'mongo', w: 150 },
    { id: 'guess', label: 'Predict', sub: 'one cause, one check', col: 2, row: 0, color: 'gql', w: 150 },
    { id: 'fix', label: 'Fix the cause', sub: 'not the symptom', col: 2, row: 1, color: 'react', w: 150 },
    { id: 'guard', label: 'Guard it', sub: 'a test that would catch it', col: 1, row: 1, color: 'forge', w: 150 },
  ],
  edges: [
    { from: 'see', to: 'narrow' }, { from: 'narrow', to: 'guess' }, { from: 'guess', to: 'fix' }, { from: 'fix', to: 'guard' },
  ],
  steps: [
    { focus: ['see'], caption: '**Reproduce it.** Until you can make it fail on demand, you can\'t tell whether you fixed it. Write the smallest script that shows the wrong output.' },
    { focus: ['narrow'], caption: '**Cut the problem in half.** Is the document wrong in MongoDB? Then look at writes. Is it right there but wrong in the GraphQL response? Then it\'s the resolver or a loader. Right in the response but wrong on screen? Then it\'s the cache or the component.' },
    { focus: ['guess'], caption: '**Say what you expect before you look.** "If a loader is caching this, a second request in the same process returns the old name, and a restart clears it." One cause, one check, and either result teaches you something.' },
    { focus: ['fix'], caption: '**Fix the cause.** If the cause is "this cache lives too long", the fix is the cache\'s lifetime. Calling `clear()` in one mutation only hides the symptom until another code path writes the same data.' },
    { focus: ['guard'], caption: '**Leave a guard behind.** A test that fails before your fix and passes after it. That test is what stops the same bug from returning in six months, when nobody remembers this week.' },
  ],
}
```

The second step is where the layers you've spent thirteen modules on start paying you back. You already know the checkpoints, so you can check them in order instead of reading everything.

| The screen is wrong because… | Check this | Tool |
| --- | --- | --- |
| the stored data is wrong | the document itself | a playground query |
| the API returns the wrong thing | the operation, with no UI involved | the Apollo sandbox or `executeOperation` |
| the cache holds an old answer | the normalized entry | `cache.extract()` |
| the component reads it wrongly | the props and derived state | React DevTools |

```quiz
Q: The board shows an old title. In MongoDB, the document has the new title, and running the same query directly against the API returns the new title. Where do you look next?
- [ ] The Mongoose model
- [ ] The resolver
- [x] Apollo Client's cache, or how the component reads from it
- [ ] The DataLoader batch function
> The database and the API are both right, so everything on the server side is cleared. That's the value of narrowing: two checks ruled out half the stack.
```

## Reading a change you didn't write

Sooner or later the bug comes from a change someone else made. That usually isn't carelessness. It's a reasonable idea that broke a rule the author didn't know about.

So when a report starts on a known date, ask what changed then. Read the pull request description as a set of claims: "we reuse X between requests" is something you can go and check against what you know. Which rule would that break, if there is one?

## Ship a feature without a guide

A short brief leaves decisions out, and that's normal. Before you write code, list what it doesn't say. What happens at the limit? Who's allowed to do this? What about existing data, which has never heard of your new field?

Then build it the way you built due dates: **data → contract → UI**, running something after each layer. When the brief truly doesn't answer a question, pick the smaller behavior and write the decision down.

## The change note

Here's the habit that separates "I made it work" from "I own this". Whenever you finish a change, write a few lines for the person who'll read it next. That's often you, three months from now.

This is what one could have looked like for due dates:

```md
## What changed
Issues have an optional due date. Cards show it and flag overdue issues,
and the issue lists can filter to overdue ones.

## Why
People were writing deadlines into issue titles, where nothing could sort or filter them.

## How I verified it
Tests cover creating, changing and clearing a date, bad input, and the "today" edge.
I also set a past date in the running app and watched the card flag it.

## What it does not do yet
No reminders, and "today" means today in UTC, so the flag can flip a few hours
early or late for someone far from UTC.
```

The last section is the one people skip, and it's the most valuable. Writing "what it does not do" forces you to look for the edges. It also tells the next person which behavior is deliberate and which is unfinished.

```quiz
Q: What makes "What it does not do yet" worth writing?
- [ ] It protects you if someone finds a bug later
- [x] It separates deliberate limits from accidents, and looking for them often finds real gaps
- [ ] Reviewers require it before approving
- [ ] It replaces the need for tests
> A limit you wrote down is a decision. A limit you didn't notice is a bug waiting for a user. Trying to write that section is often how you find the second kind.
```

## Two last jobs

The next two tasks run on your finished Taskforge. They're the only ones in the course that won't tell you which files to open.

First, an incident: a teammate's change has been merged on top of your code, and two reports have arrived. Then a feature, from a brief, finished with a change note. When those pass, you've done the things that make a codebase yours.
