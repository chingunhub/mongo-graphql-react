---
title: "Checkpoint: is Part II solid?"
minutes: 8
---

That's the server side finished. Before you read about your first week in a real repo, here's the same kind of check as at the end of Part I.

Ten mixed questions across GraphQL, resolvers, auth and scaling. It's not graded, nothing locks, and you can retake it whenever you want. Each answer names its lesson, and the result tells you whether to carry on or which lessons to reread first.

```checkpoint
Q: A search box needs to send what the user typed in a GraphQL query. What's the right way?
L: m06/l1-what-is-graphql
- [ ] Put it in the query string with a template literal
- [x] Declare a typed variable and send the value in `variables`
- [ ] Put it in an HTTP header
> It's the same reason you don't build SQL by concatenation. A variable keeps values apart from the query, and the server checks the type.
---
Q: Which type means "always a list, possibly empty, and no item in it is ever null"?
L: m06/l2-type-system
- [ ] `[Issue]`
- [ ] `[Issue]!`
- [ ] `[Issue!]`
- [x] `[Issue!]!`
> The inner `!` is about the items, and the outer `!` is about the list itself.
---
Q: `reporter` is `User!`, and its resolver throws while loading one issue in `issues: [Issue]`. What happens to that issue?
L: m06/l3-execution
- [ ] `reporter` comes back as null and the issue is otherwise fine
- [x] The whole issue becomes null, and the other issues are unaffected
- [ ] The whole response becomes `data: null`
> `reporter` can't be null, so the null moves up to the nearest nullable parent. Here that's the list item.
---
Q: `Query.books` returns `Book.find().lean()`, and the schema has `id: ID!`. The client gets "Cannot return null for non-nullable field Book.id". Why?
L: m07/l1-resolver-anatomy
- [ ] The query didn't ask for `_id`
- [ ] GraphQL can't read ObjectIds
- [x] `id` is a virtual on Mongoose documents, and lean objects don't have it
> Either drop `.lean()`, or add a small resolver: `Book: { id: (book) => String(book._id) }`.
---
Q: `updateIssue` runs `if (input.assigneeId) patch.assignee = input.assigneeId`. A client sends `assigneeId: null` to unassign. What happens?
L: m07/l2-mutations-modules
- [x] Nothing changes, because null is falsy and gets treated like "not sent"
- [ ] The issue is unassigned
- [ ] GraphQL rejects the null before the resolver runs
> Check `!== undefined`, not truthiness. Absent means "leave it" and null means "clear it".
---
Q: "Only a project's owner can delete it." Where does that check belong?
L: m08/l1-context-auth
- [ ] In the context function, so it runs before everything else
- [x] In the resolver or service doing the delete, using the current user from context
- [ ] In the SDL, on the `deleteProject` field
> The context function works out who is calling. Whether they may do this particular thing depends on the operation and the object, so it's checked there.
---
Q: The database is down, and a resolver throws `new Error('connect ECONNREFUSED 10.0.3.12:27017')`. With no `formatError`, what does the client see?
L: m08/l2-errors
- [ ] A generic "Something went wrong"
- [x] That exact message, internal address included
- [ ] Nothing, because Apollo removes it when `NODE_ENV=production`
> Production mode only strips stack traces. Masking unknown errors in `formatError` is your job.
---
Q: A DataLoader batch function does `return User.find({ _id: { $in: ids } })`. What's wrong with it?
L: m09/l1-n-plus-one
- [ ] It should run one query per id
- [ ] DataLoader can't call Mongoose
- [x] It must return one result per id in the same order, and `find` promises neither
> Build a map by id, then `ids.map(...)`, with `null` for anything missing. Otherwise an author can land on the wrong article.
---
Q: A client pages newest-first while someone adds an issue at the top. Why does a cursor cope when `offset` doesn't?
L: m09/l2-pagination
- [x] "After this item" stays true, while "skip 20" now means a different item
- [ ] Cursors lock the list while you page
- [ ] Cursors are encrypted
> A cursor names a position in the data rather than a count, so inserts above it can't shift the page.
---
Q: "Deleting an issue also deletes its comments." Which layer owns that rule?
L: m09/l3-architecture
- [ ] The schema
- [ ] The resolver
- [x] A service, because the rule stays the same whatever API sits on top
> Resolvers translate and stay thin, and repositories only know about storage. A REST endpoint or a queue worker would need the same rule.
```
