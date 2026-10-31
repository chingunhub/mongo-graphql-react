---
title: "Checkpoint: is Part I solid?"
minutes: 8
---

You've finished the Mongoose half of the course. Before GraphQL gets stacked on top of it, here's a quick way to find any soft spots.

Ten mixed questions, one from each corner of Part I. It isn't a test: nothing is graded, nothing locks, and you can take it as many times as you like. Each answer says which lesson it came from, and the result at the end tells you whether to carry on or which lessons to reread first.

```checkpoint
Q: You run `const book = new Book({ title: 'Dune' })`, and the script ends. What's in the database?
L: m01/l2-schema-model-document
- [ ] One book, because `new Book()` inserts it
- [x] Nothing, because a new document only exists in memory until you save it
- [ ] An empty book with only an `_id`
> `new Book()` builds a document in memory. It reaches MongoDB on `book.save()`, or use `Book.create()` to do both at once.
---
Q: The schema says `rating: { type: Number, max: 5 }`. You run `Book.updateOne({ _id: id }, { $set: { rating: 99 } })`. What happens?
L: m02/l1-validation
- [ ] It throws a `ValidationError`
- [ ] Mongoose changes the value to 5
- [x] 99 is saved, because validators don't run on update queries unless you set `runValidators`
> Validators run on `save()`. Update queries go straight to MongoDB unless you pass `runValidators: true`, or set it globally.
---
Q: The schema says `email: { type: String, unique: true }`, and two sign-ups with the same email arrive at the same moment. What stops the second one?
L: m02/l1-validation
- [x] MongoDB's unique index, which fails the second insert with `E11000`
- [ ] A Mongoose validator that looks for an existing user first
- [ ] Nothing, unless you wrap both writes in `try/catch`
> `unique` isn't a validator. It asks for an index, and only the database can settle a race like this one.
---
Q: A book has an embedded array holding every review it has ever received. What's the real cost as that array grows?
L: m02/l2-subdocuments
- [ ] Mongoose stops validating arrays over 1,000 items
- [x] Every read loads all of it, and a document can't pass 16 MB
- [ ] The array has to be sorted on each save
> Embed what's small and bounded. Something that grows without limit belongs in its own collection.
---
Q: A search box does `{ title: { $regex: input, $options: 'i' } }`. Someone searches for `C++`. Why is that a problem?
L: m03/l1-queries
- [ ] `$regex` only works on indexed fields
- [ ] MongoDB rejects `+` in a string
- [x] `input` is treated as a pattern, so `+` is a quantifier and other input can throw or run very slowly
> User input in a regex must be escaped first. Otherwise the user is writing your pattern for you.
---
Q: Two people buy the last ticket at the same time. Which version can't oversell?
L: m03/l2-updates
- [ ] Find the event, check `seats > 0`, subtract one, `save()`
- [x] `updateOne({ _id: id, seats: { $gt: 0 } }, { $inc: { seats: -1 } })`
- [ ] Find the event twice to make sure, then `save()`
> The check and the change happen together inside one operation. With find-then-save, both requests can read `seats: 1`.
---
Q: `Book.find().populate('author')` returns 50 books by 12 different authors. How many queries reach MongoDB?
L: m04/l1-embed-or-reference
- [x] 2
- [ ] 13
- [ ] 51
> One for the books, then one `$in` for all the author ids. The 51-query version is what you get by looping over books yourself.
---
Q: With virtual populate, `author.books` comes back filled in. Where are those links actually stored?
L: m04/l2-virtuals
- [ ] In an array that Mongoose keeps on the author
- [x] On the books, because each book holds its `author` reference
- [ ] In a hidden join collection
> A virtual stores nothing. Mongoose queries `Book` for documents whose `author` matches this author's `_id`.
---
Q: `pre('save')` hashes passwords. A new reset feature calls `User.updateOne({ _id: id }, { password: input })`. What gets stored?
L: m05/l1-hooks-methods
- [ ] A hash, because the hook runs for every write
- [ ] Nothing, because `updateOne` can't change that field
- [x] The plain password, because save hooks don't run for update queries
> `pre('save')` only runs for `save()` and `create()`. Knowing exactly which hooks run for which call is the point of that lesson.
---
Q: A pipeline runs `$group` by `$book` with `avg: { $avg: '$rating' }`, then `$match: { rating: 5 }`. What comes out?
L: m05/l2-aggregation
- [x] Nothing, because after `$group` the documents only have `_id` and `avg`
- [ ] Only the books with an average of 5
- [ ] Only the original reviews with a rating of 5
> Each stage sees only what the last stage produced. After `$group`, `rating` is gone, so you'd match on `avg` instead.
```
