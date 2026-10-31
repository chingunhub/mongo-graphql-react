import { expect } from 'expect';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { gql, InMemoryCache } from '@apollo/client';
import { createSchemaClient, renderWithClient } from '@forge/kit';
import { createFakeApi } from '@forge/fake-taskforge';
import { createApolloClient, createCache } from '../web/apollo';
import * as issueListModule from '../web/components/IssueList';

const { IssueList } = issueListModule as any;

async function setup(projectKey = 'TF', opts: Parameters<typeof createFakeApi>[0] = {}) {
  const api = createFakeApi({ delay: 20, ...opts });
  const { client, operations } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers, cache: createCache() });
  await renderWithClient(<IssueList projectKey={projectKey} />, client);
  return { api, operations };
}

const rows = async () => within(await screen.findByRole('list', { name: 'Issues' })).getAllByRole('listitem');

describe('web/apollo.ts', () => {
  function fakeFetch() {
    const seen: Record<string, string>[] = [];
    const f = async (_url: unknown, init?: any) => {
      const h = new Headers(init?.headers);
      seen.push(Object.fromEntries(h.entries()));
      return new Response(JSON.stringify({ data: { projects: [] } }), { headers: { 'content-type': 'application/json' } });
    };
    return { f: f as unknown as typeof fetch, seen };
  }
  const Q = gql`query Ping { projects { id } }`;

  test('createCache returns an InMemoryCache', () => {
    expect(createCache()).toBeInstanceOf(InMemoryCache);
  });

  test('sends "authorization: Bearer <token>" when there is a token', async () => {
    const { f, seen } = fakeFetch();
    const client = createApolloClient({ uri: 'http://test/graphql', getToken: () => 'abc123', fetch: f });
    await client.query({ query: Q });
    expect(seen[0].authorization).toBe('Bearer abc123');
  }, { hint: 'A SetContextLink that adds the header, concatenated before the HttpLink.' });

  test('no authorization header without a token', async () => {
    const { f, seen } = fakeFetch();
    const client = createApolloClient({ uri: 'http://test/graphql', getToken: () => null, fetch: f });
    await client.query({ query: Q });
    expect(seen[0].authorization).toBeUndefined();
  });

  test('reads the token per request (login after the client was created)', async () => {
    const { f, seen } = fakeFetch();
    let token: string | null = null;
    const client = createApolloClient({ uri: 'http://test/graphql', getToken: () => token, fetch: f });
    await client.query({ query: Q, fetchPolicy: 'network-only' });
    token = 'later';
    await client.query({ query: Q, fetchPolicy: 'network-only' });
    expect(seen.map((h) => h.authorization ?? null)).toEqual([null, 'Bearer later']);
  }, { hint: 'Call getToken() inside the SetContextLink callback, not outside it.' });
});

describe('IssueList', () => {
  test('exports PROJECT_ISSUES named ProjectIssues', () => {
    const doc = (issueListModule as any).PROJECT_ISSUES;
    expect(doc?.definitions?.[0]?.name?.value).toBe('ProjectIssues');
  });

  test('loading, then the project name and its issues', async () => {
    await setup();
    expect(screen.getByText('Loading issues…')).toBeTruthy();
    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('Taskforge');
    const items = await rows();
    expect(items).toHaveLength(6);
    expect(items[0].textContent).toContain('TF-6');
    expect(items[0].textContent).toContain('Fix crash on save');
    expect(items[0].textContent).toContain('URGENT');
  }, { hint: 'One <li> per issue inside <ul aria-label="Issues">.' });

  test('shows assignee names, or "Unassigned"', async () => {
    await setup();
    const items = await rows();
    expect(items.find((li) => li.textContent!.includes('Set up CI'))!.textContent).toContain('Unassigned');
    expect(items.find((li) => li.textContent!.includes('Login page'))!.textContent).toContain('Grace Hopper');
  });

  test('the status filter re-queries with that status; "All statuses" sends null', async () => {
    const { operations } = await setup();
    await rows();
    // The first load is "All statuses": status null (or omitted).
    expect(operations[0].variables.status ?? null).toBeNull();
    const select = screen.getByRole('combobox', { name: 'Status filter' });
    await userEvent.selectOptions(select, 'DONE');
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    expect((await rows())[0].textContent).toContain('Export to CSV');
    const last = operations[operations.length - 1];
    expect(last.name).toBe('ProjectIssues');
    expect(last.variables.status).toBe('DONE');
    // Back to "All statuses": those variables are already cached, so no new request is needed.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status filter' }), '');
    await waitFor(async () => expect(await rows()).toHaveLength(6));
  }, { hint: 'variables: { key: projectKey, status: status || null }' });

  test('the filter stays visible while results reload', async () => {
    await setup('TF', { delay: 120 });
    await rows();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status filter' }), 'TODO');
    expect(screen.getByRole('combobox', { name: 'Status filter' })).toBeTruthy();
    await waitFor(async () => expect(await rows()).toHaveLength(2));
  });

  test('empty results: "No issues match."', async () => {
    await setup('AGC');
    await screen.findByRole('heading', { level: 2 });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status filter' }), 'TODO');
    expect(await screen.findByText('No issues match.')).toBeTruthy();
  });

  test('unknown project: "Project not found."', async () => {
    await setup('NOPE');
    expect(await screen.findByText('Project not found.')).toBeTruthy();
  });

  test('errors: an alert with the message', async () => {
    await setup('TF', { failProject: true });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't load issues:");
    expect(alert.textContent).toContain('Database unavailable');
  });

  test('every selected object includes its id', async () => {
    const { operations } = await setup();
    await rows();
    const q = operations.find((o) => o.name === 'ProjectIssues')!.query;
    const objectSelections = (q.match(/\b(project|issues|assignee)\b[^{]*\{([^{}]*)/g) ?? []).length;
    expect(objectSelections).toBeGreaterThan(0);
    for (const block of ['project', 'assignee']) {
      const m = q.match(new RegExp(`\\b${block}\\b[^{]*\\{\\s*([\\s\\S]*?)\\}`));
      expect(m?.[1]).toMatch(/\bid\b/);
    }
  }, { hint: 'Select id on project, on each issue and on assignee.' });
});
