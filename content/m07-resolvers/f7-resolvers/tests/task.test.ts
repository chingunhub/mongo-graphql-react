import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, ensureIndexes, execute } from '@forge/kit';
import { createApolloServer } from '../server/graphql/server';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';

let server: any;
let ada: any, grace: any, tf: any;

const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
const run = (q: string, v?: Record<string, unknown>, user: any = ada) =>
  execute(server, q, v, { currentUser: user }) as Promise<any>;
const ok = async (q: string, v?: Record<string, unknown>) => {
  const r = await run(q, v);
  if (r.errors?.length) throw new Error(r.errors.map((e: any) => `${e.message} (at ${e.path?.join('.')})`).join('; '));
  return r.data;
};
const code = (r: any) => r.errors?.[0]?.extensions?.code;

beforeAll(async () => {
  server = createApolloServer();
  await ensureIndexes(User, Project, Issue);
});

beforeEach(async () => {
  await resetDb();
  ada = await User.create({ name: 'Ada Lovelace', email: 'ada@taskforge.dev' });
  grace = await User.create({ name: 'Grace Hopper', email: 'grace@taskforge.dev' });
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [grace._id, ada._id] });
  await Issue.create([
    { project: tf._id, number: 1, title: 'Set up CI', reporter: ada._id, status: 'DONE', createdAt: at(1) },
    { project: tf._id, number: 2, title: 'Login page', reporter: ada._id, assignee: grace._id, priority: 'HIGH', createdAt: at(2), labels: [{ name: 'frontend', color: '#0ea5e9' }] },
    { project: tf._id, number: 3, title: 'Dark mode', reporter: grace._id, createdAt: at(3) },
  ]);
});

describe('server', () => {
  test('createApolloServer returns an ApolloServer', () => {
    expect(server).toBeTruthy();
    expect(typeof server.executeOperation).toBe('function');
  });
});

describe('projects', () => {
  test('projects / project(key) with id, owner and members (by name)', async () => {
    const d = await ok('{ projects { id key } project(key: "tf") { name owner { name } members { name } } }');
    expect(d.projects).toEqual([{ id: String(tf._id), key: 'TF' }]);
    expect(d.project).toEqual({ name: 'Taskforge', owner: { name: 'Ada Lovelace' }, members: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }] });
  }, { hint: 'Project.owner and Project.members are ObjectIds — they need field resolvers.' });

  test('Project.issues uses SDL defaults (NEWEST, 20) and the repository filters', async () => {
    const d = await ok('{ project(key: "TF") { all: issues { title } done: issues(filter: { status: DONE }) { title } unassigned: issues(filter: { assigneeId: null }) { title } oldest: issues(sort: OLDEST, limit: 1) { title } } }');
    expect(d.project.all.map((i: any) => i.title)).toEqual(['Dark mode', 'Login page', 'Set up CI']);
    expect(d.project.done).toEqual([{ title: 'Set up CI' }]);
    expect(d.project.unassigned.map((i: any) => i.title)).toEqual(['Dark mode', 'Set up CI']);
    expect(d.project.oldest).toEqual([{ title: 'Set up CI' }]);
  }, { hint: 'Pass filter ?? {} and { sort, limit, offset } to listIssues.' });

  test('Project.issueCount with and without a filter', async () => {
    const d = await ok('{ project(key: "TF") { issueCount high: issueCount(filter: { priority: HIGH }) } }');
    expect(d.project).toEqual({ issueCount: 3, high: 1 });
  });

  test('Project.stats: total, byStatus and workload with users', async () => {
    const d = await ok('{ project(key: "TF") { stats { total byStatus { status count } workload { user { name } open } } } }');
    expect(d.project.stats).toEqual({
      total: 3,
      byStatus: [
        { status: 'TODO', count: 2 },
        { status: 'IN_PROGRESS', count: 0 },
        { status: 'IN_REVIEW', count: 0 },
        { status: 'DONE', count: 1 },
      ],
      workload: [{ user: { name: 'Grace Hopper' }, open: 1 }],
    });
  }, { hint: 'Combine projectStats() and workload(); Workload.user loads User by userId.' });

  test('createProject: the current user is owner and first member', async () => {
    const d = await ok('mutation { createProject(input: { key: "api", name: "API" }) { key description owner { name } members { name } } }');
    expect(d.createProject).toEqual({ key: 'API', description: '', owner: { name: 'Ada Lovelace' }, members: [{ name: 'Ada Lovelace' }] });
  });

  test('addMember adds once; unknown project → NOT_FOUND', async () => {
    const api = await Project.create({ name: 'API', key: 'API', owner: ada._id, members: [ada._id] });
    const q = 'mutation($p: ID!, $u: ID!) { addMember(projectId: $p, userId: $u) { members { name } } }';
    await ok(q, { p: String(api._id), u: String(grace._id) });
    const d = await ok(q, { p: String(api._id), u: String(grace._id) });
    expect(d.addMember.members).toHaveLength(2);
    expect(code(await run(q, { p: String(new mongoose.Types.ObjectId()), u: String(grace._id) }))).toBe('NOT_FOUND');
    expect(code(await run(q, { p: 'garbage', u: String(grace._id) }))).toBe('NOT_FOUND');
  }, { hint: '$addToSet + returnDocument: "after"; validate the id first.' });
});

describe('issues', () => {
  test('Issue fields: id, key, project, reporter, assignee, labels, dates', async () => {
    const d = await ok('{ project(key: "TF") { issues(sort: OLDEST) { id key number project { key } reporter { name } assignee { name } labels { name color } createdAt updatedAt } } }');
    const [ci, login] = d.project.issues;
    expect(ci.key).toBe('TF-1');
    expect(ci.project).toEqual({ key: 'TF' });
    expect(ci.reporter).toEqual({ name: 'Ada Lovelace' });
    expect(ci.assignee).toBeNull();
    expect(login.assignee).toEqual({ name: 'Grace Hopper' });
    expect(login.labels).toEqual([{ name: 'frontend', color: '#0ea5e9' }]);
    expect(ci.createdAt).toBe('2026-01-01T01:00:00.000Z');
    expect(typeof ci.id).toBe('string');
    expect(ci.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  }, { hint: 'key = `${project.key}-${number}`; dates via toISO().' });

  test('issue(id): found, unknown → null, malformed → null', async () => {
    const login = await Issue.findOne({ number: 2 });
    const q = 'query($id: ID!) { issue(id: $id) { title } }';
    expect((await ok(q, { id: String(login!._id) })).issue.title).toBe('Login page');
    expect((await ok(q, { id: String(new mongoose.Types.ObjectId()) })).issue).toBeNull();
    const bad = await run(q, { id: 'nope' });
    expect(bad.errors).toBeUndefined();
    expect(bad.data.issue).toBeNull();
  });

  test('createIssue: numbered, reported by the current user, assigneeId → assignee', async () => {
    const api = await Project.create({ name: 'API', key: 'API', owner: ada._id, members: [ada._id] });
    const d = await ok(
      'mutation($input: CreateIssueInput!) { createIssue(input: $input) { key title status priority reporter { name } assignee { name } labels { name } } }',
      { input: { projectId: String(api._id), title: 'Keyboard shortcuts', priority: 'LOW', assigneeId: String(grace._id), labels: [{ name: 'UX' }] } },
    );
    expect(d.createIssue).toEqual({
      key: 'API-1',
      title: 'Keyboard shortcuts',
      status: 'TODO',
      priority: 'LOW',
      reporter: { name: 'Ada Lovelace' },
      assignee: { name: 'Grace Hopper' },
      labels: [{ name: 'ux' }],
    });
  }, { hint: 'Issue.createInProject(projectId, { ...rest, assignee, reporter: ctx.currentUser._id }).' });

  test('createIssue on an unknown project → NOT_FOUND', async () => {
    const r = await run('mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }', {
      input: { projectId: String(new mongoose.Types.ObjectId()), title: 'Nowhere' },
    });
    expect(code(r)).toBe('NOT_FOUND');
  });

  test('updateIssue: partial update; omitted assigneeId leaves it, null unassigns', async () => {
    const login = await Issue.findOne({ number: 2 });
    const q = 'mutation($id: ID!, $input: UpdateIssueInput!) { updateIssue(id: $id, input: $input) { status title assignee { name } } }';
    const a = await ok(q, { id: String(login!._id), input: { status: 'IN_REVIEW' } });
    expect(a.updateIssue).toEqual({ status: 'IN_REVIEW', title: 'Login page', assignee: { name: 'Grace Hopper' } });
    const b = await ok(q, { id: String(login!._id), input: { assigneeId: null } });
    expect(b.updateIssue.assignee).toBeNull();
  }, { hint: 'if (assigneeId !== undefined) patch.assignee = assigneeId;' });

  test('updateIssue on unknown/malformed id → NOT_FOUND', async () => {
    const q = 'mutation($id: ID!) { updateIssue(id: $id, input: { status: DONE }) { id } }';
    expect(code(await run(q, { id: String(new mongoose.Types.ObjectId()) }))).toBe('NOT_FOUND');
    expect(code(await run(q, { id: 'x' }))).toBe('NOT_FOUND');
  });

  test('deleteIssue removes the issue and its comments, returns the id', async () => {
    const login = await Issue.findOne({ number: 2 });
    await Comment.create([{ issue: login!._id, author: ada._id, body: 'a' }, { issue: login!._id, author: ada._id, body: 'b' }]);
    const d = await ok('mutation($id: ID!) { deleteIssue(id: $id) }', { id: String(login!._id) });
    expect(d.deleteIssue).toBe(String(login!._id));
    expect(await Issue.countDocuments()).toBe(2);
    expect(await Comment.countDocuments()).toBe(0);
    expect(code(await run('mutation($id: ID!) { deleteIssue(id: $id) }', { id: String(login!._id) }))).toBe('NOT_FOUND');
  });

  test('addLabel / removeLabel', async () => {
    const ci = await Issue.findOne({ number: 1 });
    const add = await ok('mutation($id: ID!) { addLabel(issueId: $id, label: { name: "DevOps", color: "#22c55e" }) { labels { name color } } }', { id: String(ci!._id) });
    expect(add.addLabel.labels).toEqual([{ name: 'devops', color: '#22c55e' }]);
    const rm = await ok('mutation($id: ID!) { removeLabel(issueId: $id, name: "devops") { labels { name } } }', { id: String(ci!._id) });
    expect(rm.removeLabel.labels).toEqual([]);
    expect(code(await run('mutation { addLabel(issueId: "nope", label: { name: "x" }) { id } }'))).toBe('NOT_FOUND');
  });
});

describe('comments', () => {
  test('addComment by the current user; comments and commentCount on the issue', async () => {
    const login = await Issue.findOne({ number: 2 });
    await Comment.create({ issue: login!._id, author: grace._id, body: 'On it', createdAt: at(5) });
    const d = await ok('mutation($id: ID!) { addComment(issueId: $id, body: "Thanks!") { id body author { name } createdAt } }', { id: String(login!._id) });
    expect(d.addComment).toMatchObject({ body: 'Thanks!', author: { name: 'Ada Lovelace' } });
    expect(d.addComment.createdAt).toMatch(/Z$/);
    const after = await ok('query($id: ID!) { issue(id: $id) { commentCount comments { body author { name } } } }', { id: String(login!._id) });
    expect(after.issue).toEqual({
      commentCount: 2,
      comments: [
        { body: 'On it', author: { name: 'Grace Hopper' } },
        { body: 'Thanks!', author: { name: 'Ada Lovelace' } },
      ],
    });
  });

  test('addComment on an unknown issue → NOT_FOUND', async () => {
    expect(code(await run('mutation { addComment(issueId: "nope", body: "x") { id } }'))).toBe('NOT_FOUND');
    expect(code(await run('mutation($id: ID!) { addComment(issueId: $id, body: "x") { id } }', { id: String(new mongoose.Types.ObjectId()) }))).toBe('NOT_FOUND');
  });
});

describe('users', () => {
  test('users and me', async () => {
    const d = await ok('{ users { name } me { name email role } }');
    expect(d.users.map((u: any) => u.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);
    expect(d.me).toEqual({ name: 'Ada Lovelace', email: 'ada@taskforge.dev', role: 'MEMBER' });
  });
});

describe('members', () => {
  test('are sorted by name, whatever order they joined in', async () => {
    const aaron = await User.create({ name: 'Aaron Swartz', email: 'aaron@taskforge.dev' });
    await Project.updateOne({ _id: tf._id }, { $push: { members: aaron._id } });
    const d = await ok('{ project(key: "TF") { members { name } } }');
    expect(d.project.members[0].name).toBe('Aaron Swartz');
  }, { hint: 'Sort the query that loads the members.' });

  test('addMember stores an existing member only once', async () => {
    const before = (await Project.findById(tf._id))!.members.length;
    const q = 'mutation($p: ID!, $u: ID!) { addMember(projectId: $p, userId: $u) { id } }';
    await ok(q, { p: String(tf._id), u: String(ada._id) });
    expect((await Project.findById(tf._id))!.members).toHaveLength(before);
  }, { hint: 'The response can hide this, so look at what is stored: a set, not a push.' });
});
