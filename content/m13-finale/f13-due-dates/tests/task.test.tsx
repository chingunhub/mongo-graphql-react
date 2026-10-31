import { expect } from 'expect';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { print } from 'graphql';
import { resetDb, ensureIndexes, execute, createSchemaClient, renderWithClient } from '@forge/kit';
import { createFakeApi } from '@forge/fake-taskforge';
import { createApolloServer } from '../server/graphql/server';
import { buildContext } from '../server/graphql/context';
import { signToken } from '../server/auth/tokens';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';
import * as cardModule from '../web/components/IssueCard';
import { Board } from '../web/components/Board';
import { CreateIssueForm } from '../web/components/CreateIssueForm';
import { createCache } from '../web/apollo';

let server: any, ada: any, tf: any;
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function gql(query: string, variables?: Record<string, unknown>) {
  const ctx = await buildContext({ req: { headers: { authorization: `Bearer ${signToken(String(ada._id))}` } } });
  return (await execute(server, query, variables, ctx)) as any;
}
async function ok(query: string, variables?: Record<string, unknown>) {
  const r = await gql(query, variables);
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => e.message).join('; '));
  return r.data;
}
const create = (title: string, dueDate?: string | null) =>
  ok('mutation($i: CreateIssueInput!) { createIssue(input: $i) { id key dueDate isOverdue } }', {
    i: { projectId: String(tf._id), title, ...(dueDate !== undefined ? { dueDate } : {}) },
  });

beforeAll(async () => {
  server = createApolloServer();
  await ensureIndexes(User, Project, Issue, Comment);
});
beforeEach(async () => {
  await resetDb();
  ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev', password: 'ada-password' });
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id] });
});

describe('data + contract', () => {
  test('Issue.dueDate is a Date defaulting to null', async () => {
    const path: any = Issue.schema.path('dueDate');
    expect(path?.instance).toBe('Date');
    const i: any = await (Issue as any).createInProject(String(tf._id), { title: 'No date', reporter: ada._id });
    expect(i.dueDate).toBeNull();
  });

  test('create with a due date; it comes back as YYYY-MM-DD', async () => {
    const d = await create('Ship it', '2030-01-15');
    expect(d.createIssue.dueDate).toBe('2030-01-15');
    expect(d.createIssue.isOverdue).toBe(false);
    const stored: any = await Issue.findById(d.createIssue.id);
    expect(stored.dueDate.toISOString()).toBe('2030-01-15T00:00:00.000Z');
  }, { hint: 'parseDateOnly on the way in, formatDateOnly on the way out.' });

  test('isOverdue: due before today and not done', async () => {
    const past = (await create('Late', day(-2))).createIssue;
    const future = (await create('Fine', day(3))).createIssue;
    const none = (await create('Whenever')).createIssue;
    expect([past.isOverdue, future.isOverdue, none.isOverdue]).toEqual([true, false, false]);
    const done = await ok('mutation($id: ID!) { updateIssue(id: $id, input: { status: DONE }) { isOverdue } }', { id: past.id });
    expect(done.updateIssue.isOverdue).toBe(false);
  });

  test('update: change the date, clear it with null, leave it alone when omitted', async () => {
    const { id } = (await create('Movable', '2030-01-01')).createIssue;
    const q = 'mutation($id: ID!, $i: UpdateIssueInput!) { updateIssue(id: $id, input: $i) { dueDate title } }';
    expect((await ok(q, { id, i: { dueDate: '2030-02-02' } })).updateIssue.dueDate).toBe('2030-02-02');
    expect((await ok(q, { id, i: { title: 'Renamed' } })).updateIssue.dueDate).toBe('2030-02-02');
    expect((await ok(q, { id, i: { dueDate: null } })).updateIssue.dueDate).toBeNull();
  }, { hint: "Add 'dueDate' to the repository's whitelist, and only set patch.dueDate when input.dueDate !== undefined." });

  test('invalid dates → BAD_USER_INPUT with fields.dueDate', async () => {
    for (const bad of ['tomorrow', '2030-02-31', '31/12/2030']) {
      const r = await gql('mutation($i: CreateIssueInput!) { createIssue(input: $i) { id } }', {
        i: { projectId: String(tf._id), title: 'Bad date', dueDate: bad },
      });
      expect(r.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
      expect(r.errors?.[0]?.extensions?.fields).toHaveProperty('dueDate');
    }
    expect(await Issue.countDocuments()).toBe(0);
  });

  test('filter: overdue', async () => {
    await create('Late A', day(-1));
    const lateDone = (await create('Late but done', day(-5))).createIssue;
    await ok('mutation($id: ID!) { updateIssue(id: $id, input: { status: DONE }) { id } }', { id: lateDone.id });
    await create('Future', day(10));
    await create('No date');
    const d = await ok('{ project(key: "TF") { issues(filter: { overdue: true }) { title } issueCount(filter: { overdue: true }) } }');
    expect(d.project.issues.map((i: any) => i.title)).toEqual(['Late A']);
    expect(d.project.issueCount).toBe(1);
  }, { hint: 'In buildIssueFilter: dueDate < startOfTodayUTC() and status not DONE.' });

  test('an issue due today is not overdue yet', async () => {
    const due = (await create('Due today', day(0))).createIssue;
    expect(due.isOverdue).toBe(false);
    const d = await ok('{ project(key: "TF") { issues(filter: { overdue: true }) { title } } }');
    expect(d.project.issues).toEqual([]);
  }, { hint: 'Overdue means due before the start of today, not before this moment.' });

  test('overdue combines with a status filter', async () => {
    await create('Late todo', day(-2));
    const moved = (await create('Late and in review', day(-2))).createIssue;
    await ok('mutation($id: ID!) { updateIssue(id: $id, input: { status: IN_REVIEW }) { id } }', { id: moved.id });
    const d = await ok('{ project(key: "TF") { issues(filter: { overdue: true, status: IN_REVIEW }) { title } } }');
    expect(d.project.issues.map((i: any) => i.title)).toEqual(['Late and in review']);
  }, { hint: 'Build the overdue rule so it does not overwrite a status the caller asked for.' });
});

describe('UI', () => {
  test('the card fragment includes dueDate and isOverdue', () => {
    const text = print((cardModule as any).ISSUE_CARD_FIELDS);
    expect(text).toMatch(/\bdueDate\b/);
    expect(text).toMatch(/\bisOverdue\b/);
  });

  test('cards show "Due …" and flag overdue issues', async () => {
    const api = createFakeApi({ delay: 10 });
    const { client } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers, cache: createCache() });
    await renderWithClient(<Board projectKey="TF" />, client);
    const late = await screen.findByRole('article', { name: 'TF-2' });
    expect(late.textContent).toContain('Due 2026-10-01');
    expect(late.textContent).toContain('Overdue');
    const later = screen.getByRole('article', { name: 'TF-3' });
    expect(later.textContent).toContain('Due 2026-12-24');
    expect(later.textContent).not.toContain('Overdue');
    expect(screen.getByRole('article', { name: 'TF-1' }).textContent).not.toContain('Due');
  }, { hint: 'Add the fields to IssueCardFields — the board query picks them up through the fragment.' });

  test('the create form sends dueDate when set, and resets it', async () => {
    const api = createFakeApi({ delay: 10 });
    const { client } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers, cache: createCache() });
    await renderWithClient(<CreateIssueForm projectId="p1" />, client);
    const date = screen.getByLabelText('Due date') as HTMLInputElement;
    expect(date.type).toBe('date');
    await userEvent.type(screen.getByLabelText('Title'), 'With a deadline');
    await userEvent.type(date, '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Create issue' }));
    await waitFor(() => expect(api.calls.find((c) => c.field === 'createIssue')).toBeTruthy());
    expect(api.calls.find((c) => c.field === 'createIssue')!.args.input.dueDate).toBe('2026-12-01');
    await waitFor(() => expect((screen.getByLabelText('Due date') as HTMLInputElement).value).toBe(''));
  });

  test('without a due date, the form omits it', async () => {
    const api = createFakeApi({ delay: 10 });
    const { client } = await createSchemaClient({ typeDefs: api.typeDefs, resolvers: api.resolvers, cache: createCache() });
    await renderWithClient(<CreateIssueForm projectId="p1" />, client);
    await userEvent.type(screen.getByLabelText('Title'), 'No deadline');
    await userEvent.click(screen.getByRole('button', { name: 'Create issue' }));
    await waitFor(() => expect(api.calls.find((c) => c.field === 'createIssue')).toBeTruthy());
    expect(api.calls.find((c) => c.field === 'createIssue')!.args.input.dueDate ?? null).toBeNull();
  });
});
