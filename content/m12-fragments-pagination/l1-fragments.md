---
title: Fragments and colocation
minutes: 15
---

In Module 6, fragments looked like a convenience for not repeating fields. On the client, in a big codebase, they're something more important: **the way each component declares its own data needs**, so that pages can be composed from components without anyone keeping a mental list of which fields go where.

## The problem fragments solve

A page renders a list of cards. The page owns the query:

```graphql
query BoardIssues($key: String!) {
  project(key: $key) {
    issues {
      id key title priority status
      assignee { id name }
      labels { name color }
      commentCount
    }
  }
}
```

Six months later someone adds a due date badge to `IssueCard`. They need `dueDate`. Where do they add it? Not in `IssueCard.tsx` — in the **page's** query, which they first have to find. And the board page, the search results page and the "my issues" page all render `IssueCard`… so it's three queries. Miss one, and that page shows cards without due dates (or crashes on `undefined`). Remove a field the card stopped using, and you can't tell whether some *other* component on the page still needs it.

The component knows what it needs; the query is somewhere else. That's the gap.

## Colocate a fragment with the component

```tsx title="components/IssueCard.tsx"
import { gql } from '@apollo/client';

export const ISSUE_CARD_FIELDS = gql`
  fragment IssueCardFields on Issue {
    id
    key
    title
    priority
    assignee { id name }
    labels { name color }
  }
`;

export function IssueCard({ issue }: { issue: IssueCardData }) {
  return (
    <article>
      <span>{issue.key}</span> {issue.title}
      …
    </article>
  );
}
```

```tsx title="components/Board.tsx"
import { ISSUE_CARD_FIELDS, IssueCard } from './IssueCard';

const BOARD_ISSUES = gql`
  query BoardIssues($key: String!) {
    project(key: $key) {
      id
      issues { ...IssueCardFields }
    }
  }
  ${ISSUE_CARD_FIELDS}
`;
```

The `${ISSUE_CARD_FIELDS}` interpolation appends the fragment's definition to the query document. The query now reads: "for each issue, whatever `IssueCard` needs."

```viz-flow
{
  colWidth: 200,
  rowHeight: 76,
  nodes: [
    { id: 'page', label: 'Board query', sub: '...IssueCardFields', col: 0, row: 0.5, color: 'react' },
    { id: 'card', label: 'IssueCard', sub: 'IssueCardFields', col: 1, row: 0, color: 'react' },
    { id: 'status', label: 'StatusSelect', sub: 'StatusSelectFields', col: 2, row: 0, color: 'react' },
    { id: 'avatar', label: 'Avatar', sub: 'AvatarFields', col: 2, row: 1, color: 'react' },
    { id: 'search', label: 'Search query', sub: '...IssueCardFields', col: 0, row: 1.5, color: 'react' },
  ],
  edges: [
    { from: 'page', to: 'card' }, { from: 'search', to: 'card' },
    { from: 'card', to: 'status', label: 'spreads' }, { from: 'card', to: 'avatar', label: 'spreads' },
  ],
  steps: [
    { focus: ['card'], caption: 'Each component owns a fragment describing exactly the fields it renders.' },
    { focus: ['card', 'status', 'avatar', 'card>status', 'card>avatar'], caption: 'Components that render children spread **their children\'s** fragments into their own. Fragments compose like components do.' },
    { focus: ['page', 'search', 'page>card', 'search>card'], caption: 'Pages build one query from the fragments of what they render. Adding `dueDate` to IssueCard is now a change to **one file** — every page using the card picks it up.' },
  ],
}
```

On the wire nothing changes: the server receives one query with the fragments inlined. Fragments are a **source code organization** tool — which is exactly what a big codebase needs.

## Conventions you'll see

- **Name fragments after the component**: `IssueCardFields`, or `IssueCard_issue` (Relay style). Searching the codebase for the name finds the owner.
- **Always include `id`** (and Apollo adds `__typename`) so the fragment's object normalizes.
- **Export the fragment from the component file**, often as a static: `IssueCard.fragments = { issue: ISSUE_CARD_FIELDS }`.
- **A fragment describes one component's needs, not "common fields".** A `BasicIssueFields` fragment shared by twelve components is the original problem in disguise: nobody can remove a field from it safely. The Apollo team's own guidance is "fragments are for colocation, not reuse".

## Reading fragments from the cache

Because the cache is normalized, any component can read "the `IssueCardFields` of `Issue:i1`" straight from the cache, without a query — that's `useFragment`:

```tsx
import { useFragment } from '@apollo/client/react';

const { data, complete } = useFragment({
  fragment: ISSUE_CARD_FIELDS,
  from: { __typename: 'Issue', id: issueId },
});
```

It re-renders when that entity changes. Combined with **data masking** (an Apollo Client 4 option where a component can only see the fields from its own fragments), this is where large Apollo codebases are heading: each component subscribes to exactly its slice. In this course we keep it simpler — fragments for colocation, data passed via props — but you'll recognize `useFragment` when you see it.

## Fragments on interfaces and unions

Fragments can target abstract types too — remember the search union:

```graphql
fragment SearchHit on SearchResult {
  __typename
  ... on Issue { id key title }
  ... on Project { id key name }
  ... on User { id name }
}
```

For unions/interfaces, Apollo's cache needs to know which concrete types belong to which abstract type (`possibleTypes` in `InMemoryCache` config) to match fragments correctly. Codebases usually generate that from the schema; it's one of those configs you'll find in `apollo.ts` and now understand.

```quiz
Q: A field is added to `IssueCardFields`. Which queries need to change for every page showing cards to get it?
- [x] None — every query spreading the fragment includes it automatically
- [ ] Every query that renders IssueCard
- [ ] Only the board query
> That's the point of colocation: the component's data needs change in the component's file.
```

```quiz
Q: A team creates `CommonIssueFields` (id, key, title, status, priority, assignee, labels, dueDate) and spreads it in 15 components. What's the long-term problem?
- [ ] Fragments can't be spread more than once
- [x] Nobody can tell which components need which fields, so nothing can ever be removed safely
- [ ] It makes queries slower
> Shared "common" fragments recreate the coupling fragments were meant to remove. One fragment per component.
```
