import { expect } from 'expect';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSchemaClient, renderWithClient } from '@forge/kit';
import { createFakeApi } from '@forge/fake-taskforge';
import { createCache } from '../web/apollo';
import { IssueList } from '../web/components/IssueList';
import * as statusModule from '../web/components/StatusSelect';
import * as createModule from '../web/components/CreateIssueForm';

async function setup(opts: Parameters<typeof createFakeApi>[0] = {}) {
  const api = createFakeApi({ delay: 15, ...opts });
  const { client, operations } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers, cache: createCache() });
  await renderWithClient(<IssueList projectKey="TF" />, client);
  await screen.findByRole('list', { name: 'Issues' });
  return { api, operations };
}

const rows = () => within(screen.getByRole('list', { name: 'Issues' })).getAllByRole('listitem');
const statusOf = (key: string) => screen.getByRole('combobox', { name: `Status of ${key}` }) as HTMLSelectElement;

describe('CreateIssueForm', () => {
  test('exports CREATE_ISSUE named CreateIssue and is rendered by IssueList', async () => {
    expect((createModule as any).CREATE_ISSUE?.definitions?.[0]?.name?.value).toBe('CreateIssue');
    await setup();
    expect(screen.getByLabelText('Title')).toBeTruthy();
    expect((screen.getByLabelText('Priority') as HTMLSelectElement).value).toBe('MEDIUM');
  }, { hint: 'Render <CreateIssueForm projectId={project.id} /> in IssueList once the project loaded.' });

  test('creating: refetches the list, clears the form, announces the key', async () => {
    const { api } = await setup({ delay: 60 });
    await userEvent.type(screen.getByLabelText('Title'), 'Keyboard shortcuts v2');
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'HIGH');
    await userEvent.click(screen.getByRole('button', { name: 'Create issue' }));
    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeTruthy();
    expect((await screen.findByRole('status')).textContent).toBe('Created TF-7');
    await waitFor(() => expect(rows()).toHaveLength(7));
    expect(rows().some((li) => li.textContent!.includes('Keyboard shortcuts v2'))).toBe(true);
    const call = api.calls.find((c) => c.field === 'createIssue')!;
    expect(call.args.input).toMatchObject({ projectId: 'p1', title: 'Keyboard shortcuts v2', priority: 'HIGH' });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Priority') as HTMLSelectElement).value).toBe('MEDIUM');
  }, { hint: "refetchQueries: ['ProjectIssues'], awaitRefetchQueries: true — then read data.createIssue.key." });

  test('short titles are rejected client-side with no request', async () => {
    const { api } = await setup();
    await userEvent.type(screen.getByLabelText('Title'), '  ab ');
    await userEvent.click(screen.getByRole('button', { name: 'Create issue' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Title must be at least 3 characters');
    expect(api.calls.filter((c) => c.field === 'createIssue')).toHaveLength(0);
  });

  test('server errors show an alert', async () => {
    await setup({ failCreate: 'Only project members can do that' });
    await userEvent.type(screen.getByLabelText('Title'), 'Not allowed');
    await userEvent.click(screen.getByRole('button', { name: 'Create issue' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't create issue:");
    expect(alert.textContent).toContain('Only project members can do that');
  });
});

describe('StatusSelect', () => {
  test('exports UPDATE_ISSUE_STATUS named UpdateIssueStatus; every row has a select', async () => {
    expect((statusModule as any).UPDATE_ISSUE_STATUS?.definitions?.[0]?.name?.value).toBe('UpdateIssueStatus');
    await setup();
    expect(statusOf('TF-1').value).toBe('TODO');
    expect(statusOf('TF-4').value).toBe('DONE');
    expect(Array.from(statusOf('TF-1').options).map((o) => o.value)).toEqual(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
  }, { hint: 'Render <StatusSelect issue={issue} /> inside each <li>.' });

  test('the new status shows instantly (optimistic), before the server answers', async () => {
    const { api } = await setup({ delay: 400 });
    await userEvent.selectOptions(statusOf('TF-1'), 'IN_REVIEW');
    await waitFor(() => expect(statusOf('TF-1').value).toBe('IN_REVIEW'), { timeout: 250 });
    expect(api.data.issues.find((i) => i.id === 'i1')!.status).toBe('TODO'); // server hasn't applied it yet
    await waitFor(() => expect(api.data.issues.find((i) => i.id === 'i1')!.status).toBe('IN_REVIEW'), { timeout: 2000 });
  }, { hint: "optimisticResponse: { updateIssue: { __typename: 'Issue', id, status } }" });

  test('an issue moved out of a filtered list disappears from it', async () => {
    await setup();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status filter' }), 'TODO');
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.selectOptions(statusOf('TF-1'), 'DONE');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0].textContent).toContain('TF-5');
  }, { hint: "Entity updates don't change list membership — refetchQueries: ['ProjectIssues']." });

  test('a failed update snaps back and shows an alert', async () => {
    await setup({ delay: 60, failUpdate: 'Only project members can do that' });
    await userEvent.selectOptions(statusOf('TF-1'), 'DONE');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't update TF-1:");
    expect(alert.textContent).toContain('Only project members can do that');
    await waitFor(() => expect(statusOf('TF-1').value).toBe('TODO'));
  });
});
