---
title: Testing components that fetch
minutes: 14
---

From here on, the hidden tests render **your React components** in a simulated browser (jsdom) and interact with them like a user would. It's worth understanding how, because it's exactly how you'd test them on a real team — and because reading a failing test well is half the skill.

## Testing Library: test what users see

[Testing Library](https://testing-library.com/) renders a component and lets you find things **the way a user (or a screen reader) would**: by role, label and text — not by CSS class or component internals.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

render(<StatusFilter />);
await userEvent.selectOptions(screen.getByLabelText('Status'), 'DONE');
expect(screen.getByRole('heading', { name: 'Done' })).toBeTruthy();
```

| Query | When nothing matches | Use for |
| --- | --- | --- |
| `getBy…` | throws immediately | things that must be there **now** |
| `queryBy…` | returns `null` | asserting something is **absent** |
| `findBy…` | waits (retries), then throws | things that appear **after** async work — like data |

And the selector kinds, from most to least preferred: `ByRole` (`button`, `listitem`, `combobox`, `alert`, `heading`…), `ByLabelText` (form fields), `ByText`, then `ByTestId` as a last resort.

This is why the briefs in this module say things like *"a `<select>` labelled **Status filter**"* and *"an error message with `role="alert"`"*: those are the handles tests (and assistive tech) use. Accessible markup and testable markup turn out to be the same thing.

```tsx
<label>
  Status filter
  <select value={status} onChange={…}>…</select>
</label>
// or: <select aria-label="Status filter">
```

## Testing a component that uses Apollo

A component with `useQuery` needs an `ApolloClient` above it. Two common approaches:

### 1. MockedProvider (exact mocks)

```tsx
import { MockedProvider } from '@apollo/client/testing/react';

const mocks = [{
  request: { query: BOOKS, variables: { tag: 'scifi' } },
  result: { data: { books: [{ __typename: 'Book', id: '1', title: 'Dune', year: 1965 }] } },
}];

render(<MockedProvider mocks={mocks}><BookList tag="scifi" /></MockedProvider>);
expect(await screen.findByText('Dune (1965)')).toBeTruthy();
```

Fast and explicit, but the mock must match the **exact** query document and variables — add a field to the component's query and every test that mocks it fails, even though the component is fine. Good for small components with stable queries; brittle at scale.

### 2. A real schema with fake resolvers

Give the client an **executable schema** (your real SDL) with in-memory resolvers, via `SchemaLink`. Now *any* valid query works, and tests check **behavior**, not query text:

```tsx
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { SchemaLink } from '@apollo/client/link/schema';
import { makeExecutableSchema } from '@graphql-tools/schema';

const schema = makeExecutableSchema({ typeDefs, resolvers: fakeResolvers });
const client = new ApolloClient({ link: new SchemaLink({ schema }), cache: new InMemoryCache() });
```

**That's what this course's hidden tests do.** They run your components against an in-memory Taskforge with the real schema, so you're free to write your queries your way — as long as the UI behaves as specified. They also record which operations your component sent and with which variables, which is how a test can check "changing the filter sends `status: DONE`".

## Testing all four states

A component that fetches has four states, so a solid test suite has (at least) four tests:

```tsx
test('shows a loading state', async () => {
  renderWithClient(<BookList />, client);
  expect(screen.getByText(/loading/i)).toBeTruthy();   // getBy: synchronously, before data
});

test('renders the books', async () => {
  renderWithClient(<BookList />, client);
  expect(await screen.findAllByRole('listitem')).toHaveLength(3);  // findBy: waits for data
});

test('shows an error', async () => {
  renderWithClient(<BookList />, clientWhoseResolverThrows);
  expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't load/i);
});

test('shows an empty state', async () => { … });
```

## Reading a failing UI test

When a UI test fails, Testing Library prints the **DOM it saw**. Read it like a screenshot:

```text
Unable to find role="listitem"

<body>
  <div>
    <p>Loading issues…</p>
  </div>
</body>
```

That says: the component was still loading when the test gave up — maybe the query errored silently, maybe `loading` never flips because the component returned early, maybe the query asks for a field the schema doesn't have. Check the console output for a GraphQL validation error — those are the most common cause in these tasks, and the sandbox shows them.

```quiz
Q: A test wants to check that the "No issues match." text appears after data loads. Which query?
- [ ] `screen.getByText('No issues match.')`
- [x] `await screen.findByText('No issues match.')`
- [ ] `screen.queryByText('No issues match.')`
> The text appears after async loading, so the test must wait for it: `findBy…`. `queryBy` is for asserting absence.
```

```quiz
Q: Why does this course test components against a schema with fake resolvers instead of exact mocks?
- [x] Any valid query works, so tests check what the component does, not the exact text of its query
- [ ] MockedProvider doesn't work with Apollo Client 4
- [ ] It's faster
> Exact mocks couple tests to query text. Schema-backed fakes let you change selections freely as long as behavior holds.
```
