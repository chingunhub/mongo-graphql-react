import { expect } from 'expect';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSchemaClient, renderWithClient } from '@forge/kit';
import { createFakeApi } from '@forge/fake-taskforge';
import { ProjectPicker } from '../ProjectPicker';

async function setup(opts: Parameters<typeof createFakeApi>[0] = {}) {
  const api = createFakeApi({ delay: 15, ...opts });
  const { client, operations } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers });
  await renderWithClient(<ProjectPicker />, client);
  return { api, operations };
}

const select = () => screen.findByRole('combobox', { name: 'Project' });

test('shows "Loading projects…" first', async () => {
  await setup();
  expect(screen.getByText('Loading projects…')).toBeTruthy();
  await select();
});

test('a select labelled Project: placeholder, then project names with keys as values', async () => {
  await setup();
  const el = (await select()) as HTMLSelectElement;
  const options = Array.from(el.options).map((o) => [o.textContent, o.value]);
  expect(options).toEqual([
    ['Choose a project…', ''],
    ['Taskforge', 'TF'],
    ['Apollo Guidance', 'AGC'],
  ]);
}, { hint: 'aria-label="Project" on the <select>; option text = name, value = key.' });

test('no project query is sent before a project is chosen', async () => {
  const { operations } = await setup();
  await select();
  await new Promise((r) => setTimeout(r, 60));
  expect(operations.filter((o) => /project\s*\(/.test(o.query))).toHaveLength(0);
  expect(screen.queryByRole('heading')).toBeNull();
}, { hint: 'skip: !key — or only mount the summary component once a key exists.' });

test('choosing a project loads and shows its summary', async () => {
  await setup({ delay: 150 });
  await userEvent.selectOptions(await select(), 'TF');
  expect(await screen.findByText('Loading summary…')).toBeTruthy();
  expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('Taskforge');
  expect(screen.getByText('6 issues')).toBeTruthy();
  const items = within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent);
  expect(items).toEqual(['TODO: 2', 'IN_PROGRESS: 2', 'IN_REVIEW: 1', 'DONE: 1']);
});

test('the summary query uses a variable for the key', async () => {
  const { operations } = await setup();
  await userEvent.selectOptions(await select(), 'AGC');
  await screen.findByRole('heading', { level: 2 });
  const op = operations.find((o) => /project\s*\(/.test(o.query));
  expect(Object.values(op?.variables ?? {})).toContain('AGC');
});

test('switching projects shows the other summary', async () => {
  await setup();
  await userEvent.selectOptions(await select(), 'TF');
  await screen.findByText('Taskforge', { selector: 'h2' });
  await userEvent.selectOptions(await select(), 'AGC');
  expect((await screen.findByText('Apollo Guidance', { selector: 'h2' })).textContent).toBe('Apollo Guidance');
  await waitFor(() => expect(screen.getByText('1 issues')).toBeTruthy());
});

test('a failing summary shows an alert with the message', async () => {
  await setup({ failProject: true });
  await userEvent.selectOptions(await select(), 'TF');
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("Couldn't load project:");
  expect(alert.textContent).toContain('Database unavailable');
}, { hint: 'if (error) return <p role="alert">Couldn\'t load project: {error.message}</p>' });
