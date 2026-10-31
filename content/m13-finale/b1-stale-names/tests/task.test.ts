import { expect } from 'expect';
import { resetDb, ensureIndexes, execute, errorCodes, countQueries } from '@forge/kit';
import { createApolloServer } from '../server/graphql/server';
import { buildContext } from '../server/graphql/context';
import { createLoaders } from '../server/graphql/loaders';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';

let server: any, ada: any, tf: any;

const ask = async (query: string, variables?: Record<string, unknown>) =>
  (await execute(server, query, variables, await buildContext({ req: { headers: {} } } as any))) as any;
const issue = (title: string) => (Issue as any).createInProject(String(tf._id), { title, reporter: ada._id });
const cards = async () =>
  (await ask('{ project(key: "TF") { issues(limit: 50) { key reporter { name } commentCount } } }')).data.project.issues;
const PAGE = `query Page($first: Int!, $after: String) {
  project(key: "TF") {
    issueConnection(first: $first, after: $after) {
      edges { cursor node { number } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
async function everyPage(first: number) {
  const seen: number[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page++) {
    const res = await ask(PAGE, { first, after });
    if (res.errors) throw new Error(res.errors[0].message);
    const conn = res.data.project.issueConnection;
    seen.push(...conn.edges.map((edge: any) => edge.node.number));
    if (!conn.pageInfo.hasNextPage) return seen;
    after = conn.pageInfo.endCursor;
  }
  throw new Error('Paging never finished: hasNextPage stayed true');
}
const sameMoment = () =>
  Issue.collection.updateMany({ project: tf._id }, { $set: { createdAt: new Date('2026-10-29T09:00:00Z') } });
const numbers = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

beforeAll(async () => {
  server = createApolloServer();
  await ensureIndexes(User, Project, Issue, Comment);
});
beforeEach(async () => {
  await resetDb();
  ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev', password: 'ada-password' });
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id] });
});

test(
  'INC-88: a renamed user shows the new name on the next request',
  async () => {
    await issue('Write the docs');
    expect((await cards())[0].reporter.name).toBe('Ada');
    await User.updateOne({ _id: ada._id }, { name: 'Ada Lovelace' });
    expect((await cards())[0].reporter.name).toBe('Ada Lovelace');
  },
  { hint: 'The old value is coming from memory, not the database. What should only live for one request?' },
);

test('INC-88: a new comment shows in the count on the next request', async () => {
  const first = await issue('Write the docs');
  expect((await cards())[0].commentCount).toBe(0);
  await Comment.create({ issue: first._id, author: ada._id, body: 'First!' });
  expect((await cards())[0].commentCount).toBe(1);
});

test(
  'two requests never share a loader',
  async () => {
    const a = createLoaders();
    const b = createLoaders();
    expect(a.userById).not.toBe(b.userById);
    expect(a.commentCountByIssue).not.toBe(b.commentCountByIssue);
    const [c, d] = await Promise.all([
      buildContext({ req: { headers: {} } } as any),
      buildContext({ req: { headers: {} } } as any),
    ]);
    expect(c.loaders).not.toBe(d.loaders);
  },
  { hint: 'Clearing a shared loader at the start of a request still leaks between requests running at the same time.' },
);

test('the fix keeps the batching: one request, a flat query count', async () => {
  const board = () => ask('{ project(key: "TF") { issues(limit: 50) { key reporter { name } assignee { name } commentCount } } }');
  for (let i = 0; i < 3; i++) await issue('Small ' + i);
  const small = await countQueries(board);
  for (let i = 0; i < 27; i++) await issue('Big ' + i);
  const big = await countQueries(board);
  expect(big.count).toBe(small.count);
  expect(big.ops.filter((op: any) => op.collection === 'users').length).toBe(1);
});

test(
  'INC-91: a page break inside a same-moment batch loses nothing',
  async () => {
    for (let i = 0; i < 8; i++) await issue('Imported ' + i);
    await sameMoment();
    const seen = await everyPage(3);
    expect([...seen].sort((a, b) => a - b)).toEqual(numbers(8));
  },
  { hint: 'A cursor holding only a timestamp cannot say where inside a same-moment batch you stopped.' },
);

test('INC-91: every page size gives the same issues in the same order', async () => {
  for (let i = 0; i < 7; i++) await issue('Imported ' + i);
  await sameMoment();
  const whole = (await ask(PAGE, { first: 50 })).data.project.issueConnection.edges.map((e: any) => e.node.number);
  expect(whole).toHaveLength(7);
  expect(await everyPage(1)).toEqual(whole);
  expect(await everyPage(2)).toEqual(whole);
});

test(
  'the order inside a batch does not depend on an index being there',
  async () => {
    for (let i = 0; i < 8; i++) await issue('Imported ' + i);
    await sameMoment();
    try {
      await Issue.collection.dropIndexes();
      const seen = await everyPage(3);
      expect(seen).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    } finally {
      await Issue.syncIndexes();
    }
  },
  { hint: 'The cursor can only break a tie the sort also breaks. Both need the same keys.' },
);

test('issues outside the batch stay on the right side of it', async () => {
  for (let i = 0; i < 5; i++) await issue('Imported ' + i);
  await sameMoment();
  const older: any = await issue('Older');
  const newer: any = await issue('Newer');
  await Issue.collection.updateOne({ _id: older._id }, { $set: { createdAt: new Date('2026-10-28T09:00:00Z') } });
  await Issue.collection.updateOne({ _id: newer._id }, { $set: { createdAt: new Date('2026-10-30T09:00:00Z') } });
  const seen = await everyPage(2);
  expect(seen[0]).toBe(newer.number);
  expect(seen.at(-1)).toBe(older.number);
  expect(seen).toHaveLength(7);
});

test('newest first still holds, and hasNextPage is honest', async () => {
  for (let i = 0; i < 4; i++) {
    const made: any = await issue('Issue ' + i);
    await Issue.collection.updateOne({ _id: made._id }, { $set: { createdAt: new Date(2026, 0, i + 1) } });
  }
  const first = (await ask(PAGE, { first: 4 })).data.project.issueConnection;
  expect(first.edges.map((e: any) => e.node.number)).toEqual([4, 3, 2, 1]);
  expect(first.pageInfo.hasNextPage).toBe(false);
  expect((await ask(PAGE, { first: 3 })).data.project.issueConnection.pageInfo.hasNextPage).toBe(true);
});

test('a garbage cursor is still BAD_USER_INPUT', async () => {
  await issue('Write the docs');
  for (const after of ['not-a-cursor', Buffer.from('[1]').toString('base64url'), Buffer.from('{}').toString('base64url')]) {
    expect(errorCodes(await ask(PAGE, { first: 2, after }))).toContain('BAD_USER_INPUT');
  }
});
