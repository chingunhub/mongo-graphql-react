import { expect } from 'expect';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSchemaClient, renderWithClient } from '@forge/kit';
import { createFakeApi } from '@forge/fake-taskforge';
import { CommentThread } from '../CommentThread';

const ME = { id: 'u1', name: 'Ada Lovelace' };

async function setup(opts: Parameters<typeof createFakeApi>[0] = {}) {
  const api = createFakeApi({ delay: 10, ...opts });
  const { client, operations } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers });
  await renderWithClient(<CommentThread issueId="i2" currentUser={ME} />, client);
  await screen.findByRole('heading');
  return { api, operations, client };
}

const items = () => within(screen.getByRole('list')).queryAllByRole('listitem').map((li) => li.textContent!.trim());
const heading = () => screen.getByRole('heading').textContent;

test('shows the count and the comments', async () => {
  await setup();
  expect(heading()).toBe('2 comments');
  expect(items()).toEqual(['Grace Hopper: On it', 'Ada Lovelace: Thanks!']);
});

test('Post is disabled while the comment is blank', async () => {
  await setup();
  const button = screen.getByRole('button', { name: 'Post' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  await userEvent.type(screen.getByLabelText('Comment'), '   ');
  expect(button.disabled).toBe(true);
  await userEvent.type(screen.getByLabelText('Comment'), 'hi');
  expect(button.disabled).toBe(false);
});

test('the comment appears immediately with "Sending…", then once without it', async () => {
  const { api } = await setup({ delay: 250 });
  await userEvent.type(screen.getByLabelText('Comment'), 'Shipping today');
  await userEvent.click(screen.getByRole('button', { name: 'Post' }));
  // before the server answers:
  await waitFor(() => expect(items().some((t) => t.startsWith('Ada Lovelace: Shipping today') && t.includes('Sending…'))).toBe(true), { timeout: 200 });
  expect(heading()).toBe('3 comments');
  // after:
  await waitFor(() => expect(items().filter((t) => t.includes('Shipping today'))).toEqual(['Ada Lovelace: Shipping today']), { timeout: 1500 });
  expect(heading()).toBe('3 comments');
  expect(api.calls.filter((c) => c.field === 'addComment')).toHaveLength(1);
}, { hint: 'optimisticResponse with a temp- id; update() appends via cache.modify. The optimistic layer is discarded, so no duplicate.' });

test('clears the textarea after a successful post', async () => {
  await setup();
  const box = screen.getByLabelText('Comment') as HTMLTextAreaElement;
  await userEvent.type(box, 'Done');
  await userEvent.click(screen.getByRole('button', { name: 'Post' }));
  await waitFor(() => expect(items()).toContain('Ada Lovelace: Done'));
  expect(box.value).toBe('');
});

test('does not refetch the thread', async () => {
  const { operations } = await setup();
  await userEvent.type(screen.getByLabelText('Comment'), 'No refetch please');
  await userEvent.click(screen.getByRole('button', { name: 'Post' }));
  await waitFor(() => expect(items()).toContain('Ada Lovelace: No refetch please'));
  await new Promise((r) => setTimeout(r, 50));
  expect(operations.filter((o) => o.name === 'IssueComments')).toHaveLength(1);
}, { hint: 'Update the cache in update() instead of refetchQueries.' });

test('on failure: rollback, alert, and the text is kept', async () => {
  await setup({ delay: 120, failComment: 'Rate limited' });
  const box = screen.getByLabelText('Comment') as HTMLTextAreaElement;
  await userEvent.type(box, 'Will this work?');
  await userEvent.click(screen.getByRole('button', { name: 'Post' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("Couldn't post comment:");
  expect(alert.textContent).toContain('Rate limited');
  await waitFor(() => expect(items().some((t) => t.includes('Will this work?'))).toBe(false));
  expect(heading()).toBe('2 comments');
  expect(box.value).toBe('Will this work?');
}, { hint: 'Clear the text only after the mutation resolves; catch the rejection.' });
