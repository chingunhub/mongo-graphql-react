import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'expect';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraphQLError } from 'graphql';
import { resetDb, ensureIndexes, execute, errorCodes, createSchemaClient, renderWithClient } from '@forge/kit';
import { createFakeApi } from '@forge/fake-taskforge';
import { createApolloServer } from '../server/graphql/server';
import { buildContext } from '../server/graphql/context';
import { signToken } from '../server/auth/tokens';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';
import { Board } from '../web/components/Board';
import { createCache } from '../web/apollo';
import { toBoard } from '../web/lib/toBoard';

let server: any, ada: any, grace: any, tf: any;

async function as(user: any, query: string, variables?: Record<string, unknown>) {
  const headers = user ? { authorization: `Bearer ${signToken(String(user._id))}` } : {};
  return (await execute(server, query, variables, await buildContext({ req: { headers } } as any))) as any;
}
async function ok(query: string, variables?: Record<string, unknown>) {
  const r = await as(ada, query, variables);
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => e.message).join('; '));
  return r.data;
}
const SET = 'mutation($id: ID!, $pinned: Boolean!) { setIssuePinned(id: $id, pinned: $pinned) { key pinned } }';
const pin = (issue: any, pinned = true, user = ada) => as(user, SET, { id: String(issue._id), pinned });
const make = (title: string, project = tf) => (Issue as any).createInProject(String(project._id), { title, reporter: ada._id });
const pinnedKeys = async () => (await ok('{ project(key: "TF") { pinnedIssues { key } } }')).project.pinnedIssues.map((i: any) => i.key);

beforeAll(async () => {
  server = createApolloServer();
  await ensureIndexes(User, Project, Issue, Comment);
});
beforeEach(async () => {
  await resetDb();
  ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev', password: 'ada-password' });
  grace = await User.create({ name: 'Grace', email: 'grace@taskforge.dev', password: 'grace-password' });
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id] });
});

describe('the API', () => {
  test('issues start unpinned, including ones older than this feature', async () => {
    const issue = await make('Old');
    await Issue.collection.updateOne({ _id: issue._id }, { $unset: { pinned: '' } });
    const data = await ok('{ project(key: "TF") { issues { pinned } } }');
    expect(data.project.issues).toEqual([{ pinned: false }]);
  });

  test('pin and unpin', async () => {
    const issue = await make('Only one');
    expect((await pin(issue)).data.setIssuePinned).toEqual({ key: 'TF-1', pinned: true });
    expect((await Issue.findById(issue._id))?.get('pinned')).toBe(true);
    expect((await pin(issue, false)).data.setIssuePinned.pinned).toBe(false);
  });

  test('the same order of errors as your other mutations', async () => {
    const issue = await make('Only one');
    expect(errorCodes(await pin(issue, true, null))).toEqual(['UNAUTHENTICATED']);
    expect(errorCodes(await as(ada, SET, { id: 'nope', pinned: true }))).toEqual(['NOT_FOUND']);
    expect(errorCodes(await pin(issue, true, grace))).toEqual(['FORBIDDEN']);
    expect((await Issue.findById(issue._id))?.get('pinned')).toBe(false);
  });

  test(
    'a fourth pin is refused and changes nothing',
    async () => {
      const issues = [await make('Alpha'), await make('Bravo'), await make('Charlie'), await make('Delta')];
      for (const issue of issues.slice(0, 3)) expect((await pin(issue)).errors).toBeUndefined();
      expect(errorCodes(await pin(issues[3]))).toEqual(['BAD_USER_INPUT']);
      expect((await Issue.findById(issues[3]._id))?.get('pinned')).toBe(false);
    },
    { hint: 'Count the pinned issues in this project on the server, before you write.' },
  );

  test(
    'at the limit, unpinning works and re-pinning a pinned issue is fine',
    async () => {
      const issues = [await make('Alpha'), await make('Bravo'), await make('Charlie'), await make('Delta')];
      for (const issue of issues.slice(0, 3)) await pin(issue);
      expect((await pin(issues[3], false)).errors).toBeUndefined();
      expect((await pin(issues[0])).errors).toBeUndefined();
      expect((await pin(issues[0], false)).errors).toBeUndefined();
      expect((await pin(issues[3])).errors).toBeUndefined();
    },
    { hint: 'The limit is about adding a pin. Which requests do not add one?' },
  );

  test('the limit is per project', async () => {
    const other = await Project.create({ name: 'Docs', key: 'DOCS', owner: ada._id, members: [ada._id] });
    for (const title of ['Alpha', 'Bravo', 'Charlie']) await pin(await make(title));
    expect((await pin(await make('Elsewhere', other))).errors).toBeUndefined();
  });

  test('pinnedIssues lists this project only, newest first', async () => {
    const other = await Project.create({ name: 'Docs', key: 'DOCS', owner: ada._id, members: [ada._id] });
    const [a, b, c] = [await make('Alpha'), await make('Bravo'), await make('Charlie')];
    await pin(await make('Elsewhere', other));
    await make('Not pinned');
    await Issue.collection.updateOne({ _id: a._id }, { $set: { createdAt: new Date('2026-01-03') } });
    await Issue.collection.updateOne({ _id: b._id }, { $set: { createdAt: new Date('2026-01-01') } });
    await Issue.collection.updateOne({ _id: c._id }, { $set: { createdAt: new Date('2026-01-02') } });
    await pin(b);
    await pin(a);
    await pin(c);
    expect(await pinnedKeys()).toEqual(['TF-1', 'TF-3', 'TF-2']);
  });

  test('the fields you already had keep working', async () => {
    const issue = await make('Only one');
    await pin(issue);
    const data = await ok('{ project(key: "TF") { issues { title status } } }');
    expect(data.project.issues).toEqual([{ title: 'Only one', status: 'TODO' }]);
  });
});

describe('the board', () => {
  async function setup(refuse?: string) {
    cleanup();
    const api = createFakeApi({ delay: 0, issues: 16 });
    const pinned = new Set<string>();
    const typeDefs =
      api.typeDefs +
      `
      extend type Issue { pinned: Boolean! }
      extend type Mutation { setIssuePinned(id: ID!, pinned: Boolean!): Issue! }
    `;
    const resolvers = {
      ...api.resolvers,
      Issue: { ...api.resolvers.Issue, pinned: (issue: any) => pinned.has(issue.id) },
      Mutation: {
        ...api.resolvers.Mutation,
        setIssuePinned: (_: unknown, args: { id: string; pinned: boolean }) => {
          const issue = api.data.issues.find((i: any) => i.id === args.id);
          if (args.id === refuse) throw new GraphQLError('Only three pins per project', { extensions: { code: 'BAD_USER_INPUT' } });
          if (args.pinned) pinned.add(args.id);
          else pinned.delete(args.id);
          return issue;
        },
      },
    };
    const { client } = await createSchemaClient({ typeDefs, resolvers, cache: createCache() });
    await renderWithClient(<Board projectKey="TF" />, client);
    return api;
  }
  const column = (issue: HTMLElement) => issue.closest('section') as HTMLElement;
  const order = (section: HTMLElement) => within(section).getAllByRole('article').map((a) => a.getAttribute('aria-label'));

  test(
    'each card offers Pin, and a pinned card says Pinned and offers Unpin',
    async () => {
      await setup();
      const user = userEvent.setup();
      const card = await screen.findByRole('article', { name: 'TF-2' });
      expect(within(card).queryByText(/Pinned/)).toBeNull();
      await user.click(within(card).getByRole('button', { name: 'Pin TF-2' }));
      const again = await screen.findByRole('button', { name: 'Unpin TF-2' });
      expect(within(screen.getByRole('article', { name: 'TF-2' })).getByText(/Pinned/)).toBeTruthy();
      await user.click(again);
      await screen.findByRole('button', { name: 'Pin TF-2' });
    },
    { hint: 'Remember the fragment: the card can only show a field it asks for.' },
  );

  test('a pinned card moves to the top of its column, and the rest keep their order', async () => {
    const api = await setup();
    const user = userEvent.setup();
    const section = column(await screen.findByRole('article', { name: 'TF-1' }));
    const before = order(section);
    const tracked = api.data.issues.filter((i: any) => i.project === 'p1');
    expect(before).toEqual(toBoard([...tracked].reverse() as any).TODO.map((i: any) => 'TF-' + i.number));
    expect(before.length).toBeGreaterThan(2);
    const last = before.at(-1)!;
    await user.click(screen.getByRole('button', { name: 'Pin ' + last }));
    await waitFor(() => expect(order(section)).toEqual([last, ...before.slice(0, -1)]));
    await user.click(await screen.findByRole('button', { name: 'Unpin ' + last }));
    await waitFor(() => expect(order(section)).toEqual(before));
  });

  test('a card does not leave its column when pinned', async () => {
    await setup();
    const user = userEvent.setup();
    const card = await screen.findByRole('article', { name: 'TF-2' });
    const label = column(card).getAttribute('aria-label');
    await user.click(within(card).getByRole('button', { name: 'Pin TF-2' }));
    await screen.findByRole('button', { name: 'Unpin TF-2' });
    expect(column(screen.getByRole('article', { name: 'TF-2' })).getAttribute('aria-label')).toBe(label);
  });

  test(
    'a refused pin shows the server message and leaves the card alone',
    async () => {
      await setup('i3');
      const user = userEvent.setup();
      await screen.findByRole('article', { name: 'TF-3' });
      await user.click(screen.getByRole('button', { name: 'Pin TF-3' }));
      expect((await screen.findByRole('alert')).textContent).toContain('Only three pins per project');
      expect(screen.getByRole('button', { name: 'Pin TF-3' })).toBeTruthy();
    },
    { hint: 'A rejected mutation with no error handling is a silent failure, or worse, an unhandled rejection.' },
  );
});

describe('the change note', () => {
  const note = () => readFileSync(join(process.cwd(), 'CHANGE_NOTE.md'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const section = (name: string) => {
    const parts = note().split(/^## +/m).slice(1);
    return parts.find((part) => part.split('\n')[0].trim() === name)?.split('\n').slice(1).join(' ').trim() ?? '';
  };
  for (const name of ['What changed', 'Why', 'How I verified it', 'What it does not do yet']) {
    test(
      `"${name}" says something`,
      () => {
        expect(section(name).split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(8);
      },
      { hint: 'A sentence or two in your own words. Keep the ## headings as they are.' },
    );
  }
});
