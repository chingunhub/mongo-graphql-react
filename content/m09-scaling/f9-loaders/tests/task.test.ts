import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, ensureIndexes, execute, countQueries } from '@forge/kit';
import { createApolloServer } from '../server/graphql/server';
import { buildContext } from '../server/graphql/context';
import * as loadersModule from '../server/graphql/loaders';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';

let server: any;
let people: any[], tf: any;

const createLoaders = () => (loadersModule as any).createLoaders();

beforeAll(async () => {
  server = createApolloServer();
  await ensureIndexes(User, Project, Issue, Comment);
});

async function seed(issueCount: number) {
  await resetDb();
  people = await User.create(['Ada', 'Grace', 'Linus', 'Margaret'].map((name) => ({ name, email: `${name.toLowerCase()}@taskforge.dev` })));
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: people[0]._id, members: [people[2]._id, people[0]._id, people[1]._id] });
  for (let i = 0; i < issueCount; i++) {
    const issue = await (Issue as any).createInProject(String(tf._id), {
      title: `Issue number ${i + 1}`,
      reporter: people[i % 4]._id,
      assignee: i % 3 ? people[(i + 1) % 4]._id : null,
    });
    if (i % 2) {
      await Comment.create([
        { issue: issue._id, author: people[(i + 2) % 4]._id, body: 'first', createdAt: new Date(Date.UTC(2026, 0, 1, i)) },
        { issue: issue._id, author: people[(i + 3) % 4]._id, body: 'second', createdAt: new Date(Date.UTC(2026, 0, 2, i)) },
      ]);
    }
  }
}

const BOARD = `{ project(key: "TF") {
  owner { name } members { name }
  issues(limit: 50, sort: OLDEST) { key project { key } reporter { name } assignee { name } commentCount comments { body author { name } } }
  stats { workload { user { name } open } }
} }`;

async function board() {
  const ctx = await buildContext({ req: { headers: {} } });
  const r: any = await execute(server, BOARD, undefined, ctx);
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => `${e.message} at ${e.path?.join('.')}`).join('; '));
  return r.data.project;
}

test('responses are unchanged', async () => {
  await seed(4);
  const p = await board();
  expect(p.owner).toEqual({ name: 'Ada' });
  expect(p.members.map((m: any) => m.name)).toEqual(['Ada', 'Grace', 'Linus']);
  expect(p.issues[0]).toEqual({ key: 'TF-1', project: { key: 'TF' }, reporter: { name: 'Ada' }, assignee: null, commentCount: 0, comments: [] });
  expect(p.issues[1]).toEqual({
    key: 'TF-2',
    project: { key: 'TF' },
    reporter: { name: 'Grace' },
    assignee: { name: 'Linus' },
    commentCount: 2,
    comments: [
      { body: 'first', author: { name: 'Margaret' } },
      { body: 'second', author: { name: 'Ada' } },
    ],
  });
}, { hint: 'members must still be sorted by name after loadMany; comments oldest first.' });

test('the number of queries does not grow with the number of issues', async () => {
  await seed(4);
  const small = await countQueries(() => board());
  await seed(24);
  const big = await countQueries(() => board());
  expect((big.result as any).issues).toHaveLength(24);
  expect(big.count).toBeLessThanOrEqual(small.count);
  expect(big.count).toBeLessThanOrEqual(14);
}, { hint: 'Every per-issue field (key, project, reporter, assignee, commentCount, comments) and Comment.author must go through ctx.loaders.' });

test('buildContext adds fresh loaders to every request', async () => {
  const a: any = await buildContext({ req: { headers: {} } });
  const b: any = await buildContext({ req: { headers: {} } });
  expect(a.loaders?.userById).toBeDefined();
  expect(a.loaders.userById).not.toBe(b.loaders.userById);
});

test('userById / projectById: key order and null for missing', async () => {
  await seed(1);
  const l = createLoaders();
  const missing = String(new mongoose.Types.ObjectId());
  const users = await l.userById.loadMany([String(people[3]._id), missing, String(people[0]._id)]);
  expect(users.map((u: any) => u?.name ?? null)).toEqual(['Margaret', null, 'Ada']);
  expect((await l.projectById.load(String(tf._id))).key).toBe('TF');
  expect(await l.projectById.load(missing)).toBeNull();
});

test('commentCountByIssue: one aggregation, 0 when none', async () => {
  await seed(4);
  const issues = await Issue.find().sort({ number: 1 });
  const l = createLoaders();
  const { result, count, ops } = await countQueries(() => l.commentCountByIssue.loadMany(issues.map((i) => String(i._id))));
  expect(result).toEqual([0, 2, 0, 2]);
  expect(count).toBe(1);
  expect(ops[0].method).toBe('aggregate');
});

test('commentsByIssue: grouped, oldest first, [] when none — one query', async () => {
  await seed(4);
  const issues = await Issue.find().sort({ number: 1 });
  const l = createLoaders();
  const { result, count } = await countQueries(() => l.commentsByIssue.loadMany(issues.map((i) => String(i._id))));
  expect((result as any[]).map((cs) => cs.map((c: any) => c.body))).toEqual([[], ['first', 'second'], [], ['first', 'second']]);
  expect(count).toBe(1);
});

test('commentsByIssue sorts by time even without the index', async () => {
  await seed(1);
  const issue = await Issue.findOne();
  await Comment.collection.dropIndexes();
  try {
    const author = people[0]._id;
    await Comment.create({ issue: issue!._id, author, body: 'newer', createdAt: new Date(Date.UTC(2031, 0, 2)) });
    await Comment.create({ issue: issue!._id, author, body: 'older', createdAt: new Date(Date.UTC(2031, 0, 1)) });
    const list = await createLoaders().commentsByIssue.load(String(issue!._id));
    const bodies = list.map((c: any) => c.body).filter((b: string) => b === 'newer' || b === 'older');
    expect(bodies).toEqual(['older', 'newer']);
  } finally {
    await Comment.syncIndexes();
  }
}, { hint: 'The index makes the sort cheap. It does not replace it.' });
