import { expect } from 'expect';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSchemaClient, renderWithClient } from '@forge/kit';
import { createFakeApi } from '@forge/fake-taskforge';
import { IssueBoard } from '../IssueBoard';

async function setup() {
  const api = createFakeApi({ delay: 10 });
  const { client } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers });
  await renderWithClient(<IssueBoard projectKey="TF" />, client);
  await screen.findByRole('list', { name: 'Issues' });
  return { api };
}

const rows = () => within(screen.getByRole('list', { name: 'Issues' })).getAllByRole('listitem');

test('symptom 1: a status change shows up without a refresh', async () => {
  const { api } = await setup();
  const picker = screen.getByRole('combobox', { name: 'Status of TF-1' }) as HTMLSelectElement;
  expect(picker.value).toBe('TODO');
  await userEvent.selectOptions(picker, 'IN_REVIEW');
  await waitFor(() => expect(api.data.issues.find((i) => i.id === 'i1')!.status).toBe('IN_REVIEW'));
  await waitFor(() => expect((screen.getByRole('combobox', { name: 'Status of TF-1' }) as HTMLSelectElement).value).toBe('IN_REVIEW'));
}, { hint: 'The SetStatus result needs an id to be merged into the cached issue.' });

test('symptom 2: a created issue appears in the list', async () => {
  await setup();
  expect(rows()).toHaveLength(6);
  await userEvent.type(screen.getByLabelText('New issue'), 'Brand new issue');
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(rows()).toHaveLength(7));
  expect(rows().some((li) => li.textContent!.includes('Brand new issue'))).toBe(true);
}, { hint: 'refetchQueries names must match the query’s operation name exactly.' });

test('symptom 3: the Done counter follows status changes', async () => {
  await setup();
  expect(screen.getByText('Done: 1')).toBeTruthy();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status of TF-1' }), 'DONE');
  expect(await screen.findByText('Done: 2')).toBeTruthy();
}, { hint: 'A server-computed count can’t be derived by the cache. Refetch the page query after a status change.' });
