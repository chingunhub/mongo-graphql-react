import { gql } from '@apollo/client';
import { expect } from 'expect';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { print } from 'graphql';
import { createSchemaClient, renderWithClient } from '@forge/kit';
import { createFakeApi } from '@forge/fake-taskforge';
import { createCache } from '../web/apollo';
import * as boardModule from '../web/components/Board';
import * as cardModule from '../web/components/IssueCard';
import { CreateIssueForm } from '../web/components/CreateIssueForm';

const { Board } = boardModule as any;

async function setup(opts: Parameters<typeof createFakeApi>[0] = {}, pageSize = 20, withForm = false) {
  const api = createFakeApi({ delay: 15, ...opts });
  const { client, operations } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers, cache: createCache() });
  await renderWithClient(
    <>
      {withForm && <CreateIssueForm projectId="p1" />}
      <Board projectKey="TF" pageSize={pageSize} />
    </>,
    client,
  );
  await screen.findByRole('region', { name: 'To do' });
  return { api, operations, client };
}

const column = (label: string) => screen.getByRole('region', { name: label });
const cardsIn = (label: string) => within(column(label)).queryAllByRole('article').map((a) => a.getAttribute('aria-label'));

describe('IssueCard fragment', () => {
  test('exports ISSUE_CARD_FIELDS: fragment IssueCardFields on Issue with the card’s fields', () => {
    const doc = (cardModule as any).ISSUE_CARD_FIELDS;
    const def = doc?.definitions?.[0];
    expect(def?.kind).toBe('FragmentDefinition');
    expect(def?.name?.value).toBe('IssueCardFields');
    expect(def?.typeCondition?.name?.value).toBe('Issue');
    const text = print(doc);
    for (const f of ['id', 'key', 'title', 'status', 'priority', 'commentCount', 'labels', 'assignee']) expect(text).toMatch(new RegExp(`\\b${f}\\b`));
  });

  test('BOARD_ISSUES is BoardIssues and spreads the fragment', () => {
    const doc = (boardModule as any).BOARD_ISSUES;
    expect(doc?.definitions?.[0]?.name?.value).toBe('BoardIssues');
    const text = print(doc);
    expect(text).toContain('...IssueCardFields');
    expect(text).toContain('fragment IssueCardFields on Issue');
    expect(text).toMatch(/issueConnection/);
  }, { hint: 'Interpolate ${ISSUE_CARD_FIELDS} at the end of the BoardIssues document.' });
});

describe('Board', () => {
  test('four columns with counts, cards grouped by status and sorted by priority', async () => {
    await setup({ issues: 8 });
    expect(within(column('To do')).getByRole('heading').textContent).toBe('To do (2)');
    expect(within(column('Done')).getByRole('heading').textContent).toBe('Done (2)');
    // TODO issues: TF-1 (LOW), TF-5 (LOW) → keep order by newest first from the API: TF-5, TF-1
    expect(cardsIn('To do')).toEqual(['TF-5', 'TF-1']);
    // IN_PROGRESS: TF-2 (URGENT), TF-6 (URGENT): newest first → TF-6, TF-2
    expect(cardsIn('In progress')).toEqual(['TF-6', 'TF-2']);
  }, { hint: 'Group with toBoard(issues) and render the COLUMNS in order.' });

  test('a card shows key, title, priority, assignee or Unassigned, labels and comment count', async () => {
    await setup({ issues: 8 });
    const card = screen.getByRole('article', { name: 'TF-2' });
    expect(card.textContent).toContain('Login page');
    expect(card.textContent).toContain('URGENT');
    expect(card.textContent).toContain('Grace Hopper');
    expect(card.textContent).toContain('frontend');
    expect(card.textContent).toContain('2 comments');
    expect(screen.getByRole('article', { name: 'TF-1' }).textContent).toContain('Unassigned');
    expect(within(card).getByRole('combobox', { name: 'Status of TF-2' })).toBeTruthy();
  });

  test('Showing N of M, Load more merges pages, then disappears', async () => {
    await setup({ issues: 13 }, 5);
    expect(screen.getByText('Showing 5 of 13')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('Showing 10 of 13')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('Showing 13 of 13')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    const all = ['To do', 'In progress', 'In review', 'Done'].flatMap(cardsIn);
    expect(new Set(all).size).toBe(13);
  }, { hint: "Without relayStylePagination(['filter']) on Project.issueConnection, page 2 replaces page 1 instead of merging." });

  test('"Loading more…" while fetching the next page', async () => {
    await setup({ issues: 13, delay: 150 }, 5);
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    const busy = await screen.findByRole('button', { name: 'Loading more…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
  });

  test('changing a status moves the card to its new column instantly', async () => {
    await setup({ issues: 8, delay: 300 });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status of TF-1' }), 'DONE');
    await waitFor(() => expect(cardsIn('Done')).toContain('TF-1'), { timeout: 250 });
    expect(cardsIn('To do')).not.toContain('TF-1');
  });

  test('errors render an alert', async () => {
    const api = createFakeApi({ failProject: true });
    const { client } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers, cache: createCache() });
    await renderWithClient(<Board projectKey="TF" />, client);
    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't load board:");
  });
});

describe('integration', () => {
  test('creating an issue puts it on the board', async () => {
    await setup({ issues: 6 }, 20, true);
    await userEvent.type(screen.getByLabelText('Title'), 'Card from the form');
    await userEvent.click(screen.getByRole('button', { name: 'Create issue' }));
    await waitFor(() => expect(cardsIn('To do')).toContain('TF-7'));
  }, { hint: "CreateIssueForm refetches 'ProjectIssues' — the board's query has a different name." });
});

test('the cache keeps one list per filter', () => {
  const PAGE = gql`
    query Page($first: Int, $filter: IssueFilter) {
      project(key: "TF") {
        id
        issueConnection(first: $first, filter: $filter) {
          edges { cursor node { id } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;
  const cache = createCache();
  const write = (status: string, id: string) =>
    cache.writeQuery({
      query: PAGE,
      variables: { first: 5, filter: { status } },
      data: {
        project: {
          __typename: 'Project',
          id: 'p1',
          issueConnection: {
            __typename: 'IssueConnection',
            edges: [{ __typename: 'IssueEdge', cursor: id, node: { __typename: 'Issue', id } }],
            pageInfo: { __typename: 'PageInfo', hasNextPage: false, endCursor: id },
          },
        },
      },
    });
  write('TODO', 'todo-1');
  write('DONE', 'done-1');
  const read: any = cache.readQuery({ query: PAGE, variables: { first: 5, filter: { status: 'TODO' } } });
  expect(read.project.issueConnection.edges.map((e: any) => e.cursor)).toEqual(['todo-1']);
}, { hint: 'Tell the pagination helper which arguments make a separate list.' });
