---
title: "Taskforge: users that keep secrets"
kind: forge
workspace: taskforge
db: true
summary: Password hashing that can't be bypassed, a hidden field, a method, a static and a JSON transform.
focus: [server/models/User.ts, server/auth/password.ts, playground.ts]
readonly: [server/auth/password.ts]
needs: [m05/l1-hooks-methods]
---

Taskforge needs logins (the GraphQL `login` mutation arrives in module 8). Before that, the `User` model has to store passwords **safely** — hashed, never returned by accident, and impossible to store in plain text no matter which code path writes them.

The cryptography is done for you in `server/auth/password.ts` (read it — it's short): `hashPassword(plain)`, `verifyPassword(plain, stored)` and `isHashed(value)`. Your job is wiring it into the model so nobody on the team can get it wrong.

## Your task

All in `server/models/User.ts`:

1. **A `password` field** — a string, at least 8 characters (message: `Password must be at least 8 characters`), and **not returned by queries unless explicitly asked for** (`.select('+password')`). It's optional: invited users may not have one yet.

2. **Hash on save** — when a user is saved with a new or changed password, store `hashPassword(plain)` instead. Saving after changing only the name must **not** re-hash (the stored hash must stay identical).

3. **Hash on updates too** — `User.updateOne(filter, { password })`, `User.updateOne(filter, { $set: { password } })` and the same with `findOneAndUpdate` must also store a hash. They must also reject passwords under 8 characters (throw an `Error` with the same message). This is the bug from the lesson's diagram — close it.

4. **`user.checkPassword(plain)`** — an instance method resolving to `true`/`false`. If the user was loaded **without** its password field (the default!), throw an `Error` saying so — silently returning `false` would make every login fail with no clue why.

5. **Never serialize it** — `user.toJSON()` must not contain `password`, even when the field was selected.

6. **`User.findByCredentials(email, password)`** — a static resolving to the user if the email (any casing) and password match, otherwise `null`.

Also let `createUser` accept an optional `password`.

## Hints

### Hidden field, hashed on save
`select: false` on the field hides it. In `pre('save')`: `if (this.isModified('password') && this.password) this.password = hashPassword(this.password)`. Validation already ran (validate → pre-save), so `minlength` checked the *plain* password.

### Updates
Register query middleware on `['updateOne', 'findOneAndUpdate']`. Inside, `const update = this.getUpdate()`. The password can be at `update.password` or `update.$set?.password`. Check the length, replace it with the hash, then `this.setUpdate(update)`. `isHashed()` lets you skip values that are already hashes.

### JSON and statics
`userSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.password; return ret; } })`. In the static, `this.findOne({ email }).select('+password')`, then `await user.checkPassword(password)`.
