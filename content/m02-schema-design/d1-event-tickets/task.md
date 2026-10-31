---
title: "Drill: event tickets"
kind: drill
db: true
summary: Built-in and custom validators — including one that compares two fields — and turning errors into a field map.
focus: [models/Event.ts, playground.ts]
needs: [m02/l1-validation]
---

An events site needs its `Event` model to refuse nonsense: zero-capacity rooms, events that end before they start, half a seat. And when something's wrong, the signup form needs to know **which field** to highlight.

## Your task

In `models/Event.ts`, export an `Event` model (name `'Event'`) with:

| Field | Rules | Message when broken |
| --- | --- | --- |
| `title` | string, required, trimmed, 3–80 characters | too short: `Title must be at least 3 characters` |
| `capacity` | number, required, at least 1, **a whole number** | not whole: `Capacity must be a whole number` |
| `price` | number, default `0`, not negative | (default message is fine) |
| `startsAt` | date, required | |
| `endsAt` | date, required, **strictly after `startsAt`** | `Event must end after it starts` |
| `status` | one of `DRAFT`, `PUBLISHED`, `CANCELLED`; default `DRAFT` | |

Then two functions:

- **`createEvent(data)`** — saves and returns the event (throws the ValidationError if invalid — that's fine).
- **`checkEvent(data)`** — validates **without saving anything** and resolves to either
  - `{ valid: true }`, or
  - `{ valid: false, errors: { [path]: message } }` with one entry per failing field.

  ```ts
  await checkEvent({ title: 'Hi', capacity: 2.5, startsAt: new Date() /* no endsAt */ });
  // {
  //   valid: false,
  //   errors: {
  //     title: 'Title must be at least 3 characters',
  //     capacity: 'Capacity must be a whole number',
  //     endsAt: 'Path `endsAt` is required.'
  //   }
  // }
  ```

## Hints

### Whole numbers
There's no built-in "integer" validator for `Number`. A custom `validate: { validator, message }` with `Number.isInteger(v)` does it.

### Comparing two fields
Put the validator on `endsAt`. Use a regular `function (value) { ... }` so `this` is the document, then compare with `this.startsAt`. Dates compare fine with `>`. If `startsAt` is missing, `required` on `startsAt` already reports it — your validator can return `true` in that case to avoid a confusing double error.

### Validating without saving
`new Event(data)` builds a document without touching the database. `await doc.validate()` throws a `ValidationError` if anything fails; its `.errors` object is keyed by path and each entry has a `.message`.
