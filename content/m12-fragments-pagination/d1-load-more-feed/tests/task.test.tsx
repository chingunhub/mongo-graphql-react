import { gql } from '@apollo/client';
import { expect } from 'expect';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSchemaClient, renderWithClient } from '@forge/kit';
import { createFakeApi } from '@forge/fake-taskforge';
import { createFeedCache } from '../feedCache';
import { IssueFeed } from '../IssueFeed';

async function setup(delay = 15) {
  const api = createFakeApi({ issues: 23, delay });
  const { client, operations } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers, cache: createFeedCache() });
  await renderWithClient(<IssueFeed projectKey="TF" pageSize={10} />, client);
  await screen.findByRole('list', { name: 'Issues' });
  return { api, operations, client };
}

const titles = () => within(screen.getByRole('list', { name: 'Issues' })).getAllByRole('listitem').map((li) => li.textContent);
const loadMore = () => screen.getByRole('button', { name: 'Load more' });

test('first page and the counter', async () => {
  await setup();
  expect(titles()).toHaveLength(10);
  expect(screen.getByText('Showing 10 of 23')).toBeTruthy();
});

test('Load more appends pages until the end, then disappears', async () => {
  await setup();
  await userEvent.click(loadMore());
  await waitFor(() => expect(titles()).toHaveLength(20));
  expect(screen.getByText('Showing 20 of 23')).toBeTruthy();
  await userEvent.click(loadMore());
  await waitFor(() => expect(titles()).toHaveLength(23));
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  expect(new Set(titles()).size).toBe(23);
}, { hint: 'merge: with args.after, append incoming edges to existing ones.' });

test('"Loading more…" while the next page is in flight', async () => {
  await setup(150);
  await userEvent.click(loadMore());
  const busy = await screen.findByRole('button', { name: 'Loading more…' });
  expect((busy as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(titles()).toHaveLength(20));
});

test('filters are separate lists; going back to "all" is instant and keeps loaded pages', async () => {
  const { operations } = await setup();
  await userEvent.click(loadMore());
  await waitFor(() => expect(titles()).toHaveLength(20));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status filter' }), 'TODO');
  await waitFor(() => expect(screen.getByText('Showing 6 of 6')).toBeTruthy());
  const before = operations.length;
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status filter' }), '');
  await waitFor(() => expect(titles()).toHaveLength(20));
  expect(operations.length).toBe(before);
}, { hint: "keyArgs: ['filter'] — and a first page (no args.after) replaces rather than appends." });

test('fetching the same page twice does not duplicate items', async () => {
  const { client } = await setup();
  const q = (await import('@apollo/client')).gql`
    query FeedIssues($key: String!, $first: Int!, $after: String, $filter: IssueFilter) {
      project(key: $key) { id issueConnection(first: $first, after: $after, filter: $filter) {
        edges { cursor node { id title } } pageInfo { hasNextPage endCursor } totalCount } }
    }`;
  const first: any = client.readQuery({ query: q, variables: { key: 'TF', first: 10, filter: null } });
  const after = first.project.issueConnection.pageInfo.endCursor;
  await client.query({ query: q, variables: { key: 'TF', first: 10, after, filter: null }, fetchPolicy: 'network-only' });
  await client.query({ query: q, variables: { key: 'TF', first: 10, after, filter: null }, fetchPolicy: 'network-only' });
  await waitFor(() => expect(titles()).toHaveLength(20));
  expect(new Set(titles()).size).toBe(20);
}, { hint: 'Skip incoming edges whose cursor is already in existing.edges.' });

test('sends FeedIssues with first and filter variables', async () => {
  const { operations } = await setup();
  const op = operations.find((o) => o.name === 'FeedIssues')!;
  expect(op.variables).toMatchObject({ key: 'TF', first: 10 });
  expect(op.variables.filter ?? null).toBeNull();
});

describe('the merge function on its own', () => {
  const PAGE = gql`
    query Page($first: Int, $after: String, $filter: IssueFilter) {
      project(key: "TF") {
        id
        issueConnection(first: $first, after: $after, filter: $filter) {
          edges { cursor node { id title } }
          pageInfo { hasNextPage endCursor }
          totalCount
        }
      }
    }
  `;
  const write = (cache: any, after: string | null, ids: string[]) =>
    cache.writeQuery({
      query: PAGE,
      variables: { first: 2, after, filter: null },
      data: {
        project: {
          __typename: 'Project',
          id: 'p1',
          issueConnection: {
            __typename: 'IssueConnection',
            edges: ids.map((id) => ({ __typename: 'IssueEdge', cursor: id, node: { __typename: 'Issue', id, title: id } })),
            pageInfo: { __typename: 'PageInfo', hasNextPage: false, endCursor: ids[ids.length - 1] },
            totalCount: ids.length,
          },
        },
      },
    });
  const stored = (cache: any) =>
    cache.readQuery({ query: PAGE, variables: { first: 2, after: null, filter: null } }).project.issueConnection.edges.map((e: any) => e.cursor);

  test('an edge already in the list is skipped', () => {
    const cache = createFeedCache();
    write(cache, null, ['a', 'b']);
    write(cache, 'b', ['b', 'c']);
    expect(stored(cache)).toEqual(['a', 'b', 'c']);
  }, { hint: 'Compare cursors: keep only incoming edges the list does not already have.' });

  test('a page with no after replaces the list', () => {
    const cache = createFeedCache();
    write(cache, null, ['a', 'b']);
    write(cache, null, ['x']);
    expect(stored(cache)).toEqual(['x']);
  }, { hint: 'No after means a first page, so there is nothing to append to.' });
});
