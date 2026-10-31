import { expect } from 'expect';
import { resetDb, ensureIndexes, execute, countQueries } from '@forge/kit';
import { createApolloServer } from '../server/graphql/server';
import { buildContext } from '../server/graphql/context';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';

let server: any;
let ada: any, tf: any;

beforeAll(async () => {
  server = createApolloServer();
  await ensureIndexes(User, Project, Issue, Comment);
});

beforeEach(async () => {
  await resetDb();
  ada = await User.create({ name: 'Ada Lovelace', email: 'ada@taskforge.dev' });
  await User.create({ name: 'Logan Roy', email: 'logan@taskforge.dev' });
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id] });
  await Project.create({ name: 'Blog engine', key: 'LOG', owner: ada._id });
  const titles = ['Login page', 'Logout button', 'Dark mode', 'Export to CSV', 'Blog post editor', 'Fix (login) crash', 'Keyboard shortcuts'];
  for (let i = 0; i < titles.length; i++) {
    const issue = await (Issue as any).createInProject(String(tf._id), { title: titles[i], reporter: ada._id, status: i % 2 ? 'DONE' : 'TODO' });
    await Issue.collection.updateOne({ _id: issue._id }, { $set: { createdAt: new Date(Date.UTC(2026, 0, 1, i)) } });
  }
});

const run = async (q: string, v?: Record<string, unknown>) =>
  execute(server, q, v, await buildContext({ req: { headers: {} } })) as Promise<any>;
const ok = async (q: string, v?: Record<string, unknown>) => {
  const r = await run(q, v);
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => e.message).join('; '));
  return r.data;
};

const CONN = `query($first: Int, $after: String, $filter: IssueFilter) {
  project(key: "TF") {
    issueConnection(first: $first, after: $after, filter: $filter) {
      edges { cursor node { key title } }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
}`;
const keys = (d: any) => d.project.issueConnection.edges.map((e: any) => e.node.key);

describe('issueConnection', () => {
  test('first page: newest first, pageInfo, totalCount; issues still works', async () => {
    const d = await ok(CONN, { first: 3 });
    expect(keys(d)).toEqual(['TF-7', 'TF-6', 'TF-5']);
    expect(d.project.issueConnection.pageInfo.hasNextPage).toBe(true);
    expect(d.project.issueConnection.pageInfo.endCursor).toBe(d.project.issueConnection.edges[2].cursor);
    expect(d.project.issueConnection.totalCount).toBe(7);
    const old = await ok('{ project(key: "TF") { issues(limit: 2) { key } } }');
    expect(old.project.issues).toEqual([{ key: 'TF-7' }, { key: 'TF-6' }]);
  }, { hint: 'Add paginationTypeDefs to schema/index.ts and a Project.issueConnection resolver.' });

  test('walking pages with after', async () => {
    const seen: string[] = [];
    let after: string | null = null;
    for (let i = 0; i < 5; i++) {
      const d: any = await ok(CONN, { first: 3, after });
      seen.push(...keys(d));
      if (!d.project.issueConnection.pageInfo.hasNextPage) break;
      after = d.project.issueConnection.pageInfo.endCursor;
    }
    expect(seen).toEqual(['TF-7', 'TF-6', 'TF-5', 'TF-4', 'TF-3', 'TF-2', 'TF-1']);
  });

  test('filters apply to pages and to totalCount', async () => {
    const d = await ok(CONN, { first: 2, filter: { status: 'DONE' } });
    expect(keys(d)).toEqual(['TF-6', 'TF-4']);
    expect(d.project.issueConnection.totalCount).toBe(3);
    const d2 = await ok(CONN, { first: 2, after: d.project.issueConnection.pageInfo.endCursor, filter: { status: 'DONE' } });
    expect(keys(d2)).toEqual(['TF-2']);
    expect(d2.project.issueConnection.pageInfo.hasNextPage).toBe(false);
  }, { hint: 'Combine buildIssueFilter(...) and the cursor condition with $and.' });

  test('ties on createdAt still page without duplicates', async () => {
    await Issue.collection.updateMany({}, { $set: { createdAt: new Date(Date.UTC(2026, 5, 1)) } });
    const seen: string[] = [];
    let after: string | null = null;
    for (let i = 0; i < 10; i++) {
      const d: any = await ok(CONN, { first: 2, after });
      seen.push(...keys(d));
      if (!d.project.issueConnection.pageInfo.hasNextPage) break;
      after = d.project.issueConnection.pageInfo.endCursor;
    }
    expect(new Set(seen).size).toBe(7);
    expect(seen).toHaveLength(7);
  });

  test('first must be 1..50; bad cursors are BAD_USER_INPUT', async () => {
    for (const first of [0, 51]) {
      expect((await run(CONN, { first })).errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    }
    expect((await run(CONN, { first: 2, after: 'garbage' })).errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  test('totalCount costs a query only when selected', async () => {
    const q = (withTotal: boolean) =>
      `{ project(key: "TF") { issueConnection(first: 2) { edges { node { title } } ${withTotal ? 'totalCount' : ''} } } }`;
    const without = await countQueries(() => ok(q(false)));
    const withTotal = await countQueries(() => ok(q(true)));
    expect(withTotal.count).toBe(without.count + 1);
  }, { hint: 'Return totalCount as a function — the default resolver only calls it when the field is selected.' });

  test('Issue has an index on { project: 1, createdAt: -1, _id: -1 }', () => {
    const keysList = Issue.schema.indexes().map(([k]) => JSON.stringify(k));
    expect(keysList).toContain(JSON.stringify({ project: 1, createdAt: -1, _id: -1 }));
  });
});

describe('search', () => {
  const SEARCH = `query($t: String!) { search(term: $t) {
    __typename
    ... on Project { key }
    ... on Issue { key }
    ... on User { name }
  } }`;

  test('projects, then issues (newest first), then users', async () => {
    const d = await ok(SEARCH, { t: 'lo' });
    expect(d.search).toEqual([
      { __typename: 'Project', key: 'LOG' },
      { __typename: 'Issue', key: 'TF-6' },
      { __typename: 'Issue', key: 'TF-5' },
      { __typename: 'Issue', key: 'TF-2' },
      { __typename: 'Issue', key: 'TF-1' },
      { __typename: 'User', name: 'Ada Lovelace' },
      { __typename: 'User', name: 'Logan Roy' },
    ]);
  }, { hint: 'Run three queries, concatenate in order, and implement SearchResult.__resolveType.' });

  test('matches project keys and is literal (escaped)', async () => {
    expect((await ok(SEARCH, { t: 'TF' })).search).toEqual([{ __typename: 'Project', key: 'TF' }]);
    expect((await ok(SEARCH, { t: '(login' })).search).toEqual([{ __typename: 'Issue', key: 'TF-6' }]);
    expect((await ok(SEARCH, { t: '.*' })).search).toEqual([]);
  });

  test('at most 5 per type', async () => {
    for (let i = 0; i < 8; i++) await (Issue as any).createInProject(String(tf._id), { title: `Logging task ${i}`, reporter: ada._id });
    const d = await ok(SEARCH, { t: 'logging' });
    expect(d.search.filter((r: any) => r.__typename === 'Issue')).toHaveLength(5);
  });

  test('terms shorter than 2 characters → BAD_USER_INPUT', async () => {
    const r = await run(SEARCH, { t: ' a ' });
    expect(r.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    expect(r.errors?.[0]?.message).toBe('Search term must be at least 2 characters');
  });
});

describe('page boundaries', () => {
  test('a page that ends exactly at the last item has no next page', async () => {
    expect((await ok(CONN, { first: 7 })).project.issueConnection.pageInfo.hasNextPage).toBe(false);
    const done = await ok(CONN, { first: 3, filter: { status: 'DONE' } });
    expect(done.project.issueConnection.pageInfo.hasNextPage).toBe(false);
  }, { hint: 'A full page does not prove there is more. Only an extra row does.' });

  test('tied timestamps page cleanly with no index to lean on', async () => {
    await Issue.collection.updateMany({}, { $set: { createdAt: new Date(Date.UTC(2026, 0, 1)) } });
    await Issue.collection.dropIndexes();
    try {
      const seen: string[] = [];
      let after: string | null = null;
      for (let i = 0; i < 8; i++) {
        const d: any = await ok(CONN, { first: 3, after });
        seen.push(...keys(d));
        if (!d.project.issueConnection.pageInfo.hasNextPage) break;
        after = d.project.issueConnection.pageInfo.endCursor;
      }
      expect(new Set(seen).size).toBe(7);
      expect(seen).toHaveLength(7);
    } finally {
      await Issue.syncIndexes();
    }
  }, { hint: 'The sort needs the same tie-break as the cursor.' });

  test('a cursor with the wrong shape is rejected', async () => {
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    for (const after of [encode(['not-a-date', '507f1f77bcf86cd799439011']), encode({ a: 1 })]) {
      const r = await run(CONN, { first: 3, after });
      expect(r.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    }
  }, { hint: 'A cursor is client input. Check what is inside it, not just that it decodes.' });
});
