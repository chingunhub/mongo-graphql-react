---
title: 'Build a view that tells the truth'
minutes: 30
---

A successful response is only one state of an interface. A support agent looking at an empty list needs to know: are there no tickets, is it still loading, or did the server fail? They'd do something different for each, so your screen has to say which.

```viz-flow
{
  title: 'Four things that can look like an empty list',
  colWidth: 215,
  rowHeight: 88,
  nodes: [
    { id: 'q', label: 'Query state', col: 0, row: 1, color: 'react' },
    { id: 'load', label: 'Loading', sub: 'say so, and wait', col: 1, row: 0, color: 'neutral' },
    { id: 'err', label: 'Failed', sub: 'an alert and a retry', col: 1, row: 1, color: 'forge' },
    { id: 'empty', label: 'Empty', sub: 'truly no tickets', col: 2, row: 0, color: 'gql' },
    { id: 'data', label: 'Data', sub: 'the list', col: 2, row: 1, color: 'gql' },
  ],
  edges: [
    { from: 'q', to: 'load' },
    { from: 'q', to: 'err' },
    { from: 'q', to: 'empty' },
    { from: 'q', to: 'data' },
  ],
  steps: [
    { focus: ['q>load', 'load'], caption: 'No answer yet. Showing "No tickets" here would be a lie that lasts 200 ms.' },
    { focus: ['q>err', 'err'], caption: 'An outage is not an empty inbox. The agent must see the difference, and be able to try again.' },
    { focus: ['q>empty', 'empty', 'q>data', 'data'], caption: 'Only a successful answer can tell you that the list is empty.' },
  ],
}
```

## A form is a draft, not a database record

A half-finished reservation form isn't invalid so much as unfinished. React Hook Form holds the draft and coordinates submission, and a Zod schema decides whether the draft is ready.

```tsx
const reservationDraft = z.object({
  title: z.string().trim().min(1, 'Enter a title'),
});

function ReservationForm({ reserve }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(reservationDraft),
    defaultValues: { title: '' },
  });

  return (
    <form onSubmit={handleSubmit(reserve)}>
      <label>
        Title
        <input {...register('title')} />
      </label>
      {errors.title && <p role="alert">{errors.title.message}</p>}
      <button disabled={isSubmitting}>Reserve</button>
    </form>
  );
}
```

`register` connects an input without you writing `value` and `onChange`. `handleSubmit` runs your callback only after validation succeeds, and passes it the **parsed** values, so the `trim()` has already happened.

You've now seen every kind of schema in this course, so here's the whole family:

| Schema | Checks | When |
| --- | --- | --- |
| TypeScript type | Your code | Compile time |
| Zod, in the browser | A draft | Before sending |
| Zod, on the server | A received value | On arrival |
| GraphQL schema | An operation's shape | On execution |
| Mongoose Schema | A document | Before writing |
| Unique index | One invariant | At commit |

None of them can stand in for another. Browser validation is a courtesy to the user, as anyone can skip the form. The server still validates and authorizes.

### Keep a failed draft

If a network timeout follows an intake request, you don't know whether the ticket was created. Keep the form filled in.

Clearing it means the agent retypes, gets a new source key, and maybe makes a second ticket. Keeping it means a retry sends the same key, and your idempotent intake from Module 16 does its job. A UI decision and a backend guarantee work together, and neither would be enough alone.

## Mutations change what you know

A triage button sends the version that was **actually on screen**. Then what?

```compare
--- ✘ Guess
await api.triage({ ...input, expectedVersion: ticket.version });
setVersion(ticket.version + 1); // ✘ a guess about the server
// ✘ another agent's change is now invisible
--- ✔ Ask
await api.triage({ ...input, expectedVersion: ticket.version });
await refetch(); // ✔ the server says what's true
// On CONFLICT: show it, offer a refresh.
// Never silently retry at a version nobody saw.
```

Accepting a ticket and refreshing the list are two facts, and they can come apart. Say intake succeeds and the refresh fails. Did the ticket get accepted? Yes. So the operations panel should hear about it **before** you try the refresh, and the screen should show both: "accepted" and "couldn't refresh".

```quiz
Q: Intake succeeds, but the following inbox refresh fails. Should the operations panel be told about the accepted write?
- [x] Yes, acceptance is already confirmed
- [ ] No, a failed refresh rolls back the write
- [ ] Only after the user submits the same ticket with a new source key
> A read failure can't undo a successful write. Keep the success and the refresh failure visible, as two separate facts.
```

## Late responses have owners

North starts a slow request. Before it finishes, the user switches to South. The request *will* finish.

```viz-sequence
{title:'A response from a previous life',actors:[{id:'north',label:'North view',color:'react'},{id:'api',label:'Server',color:'gql'},{id:'south',label:'South view',color:'react'}],steps:[
{from:'north',to:'api',label:'accept ticket (generation 1)',note:'Capture the lifetime that started this work.'},
{from:'north',to:'south',label:'identity changes (generation 2)',note:'The old view unmounts, or its generation changes.'},
{from:'api',to:'north',label:'old request succeeds',ret:true,note:'The server may have done the work. Cancelling your interest is **not** a rollback.'},
{from:'north',to:'north',label:'discard old UI completion',note:'No success message, no refresh of the new cache, and no releasing the new view\'s pending action.'}
]}
```

Keying the shell by identity gives each view a fresh lifetime, and it covers most of this. A guard is what makes a component safe when an injected API changes in place. Here's the idea in its smallest form:

```ts
// @worked-example latest-only
export function lifetime() {
  let current = 0;
  return {
    begin() {
      const mine = ++current;
      return () => mine === current;
    },
    end() {
      current += 1;
    },
  };
}
```

`begin()` hands back a small question to ask later: "Am I still the latest?" Each operation captures one, and checks it before applying **any** result: success, error or the `finally` that releases a button.

That last one is easy to miss. If an old request's `finally` runs `setBusy(false)`, it unlocks the buttons while the *new* view's action is still running.

One more thing about double clicks. `useState` won't help you there, since `setBusy(true)` takes effect at the next render, and two clicks can happen before that. A `useRef` can claim the action synchronously.

```quiz
Q: An action from the previous tenant finishes and runs setBusy(false) in its finally block. What's the bug?
- [ ] There isn't one, finally always runs
- [x] It can release the current view's buttons while the current action is still running
- [ ] finally can't call setState
> A stale operation has to skip all of its effects, including cleanup that belongs to a newer lifetime.
```

```quiz
Q: Why keep the form's values after a failed intake?
- [x] A retry can reuse the same source key, so the server can recognize it
- [ ] So that the browser can resend it automatically
- [ ] Because React Hook Form can't reset
> The failure might mean "unknown". A stable source key turns a retry into the idempotent operation you built in Module 16.
```

## Your next build

Build the real inbox, using the generated query type, React Hook Form and the Zod resolver. The grader exercises visible behavior with a real Apollo client: validation, network failure, loading, empty and error states, current-version commands, retries and stale responses. It doesn't give credit for importing a library, so another correct design passes too.

When it passes, open the preview and try whitespace-only input, a read-only identity and a stale version. For each result, name the boundary that produced it.
