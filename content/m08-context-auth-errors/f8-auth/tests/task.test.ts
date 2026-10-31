import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, ensureIndexes, execute } from '@forge/kit';
import { createApolloServer } from '../server/graphql/server';
import { buildContext } from '../server/graphql/context';
import * as errors from '../server/graphql/errors';
import * as permissions from '../server/services/permissions';
import { signToken } from '../server/auth/tokens';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';

let server: any;
let ada: any, grace: any, linus: any, admin: any, tf: any, issue: any;

const tokenOf = (u: any) => signToken(String(u._id));
async function as(user: any | null, query: string, variables?: Record<string, unknown>) {
  const headers = user ? { authorization: `Bearer ${tokenOf(user)}` } : {};
  const ctx = await buildContext({ req: { headers } });
  return execute(server, query, variables, ctx) as Promise<any>;
}
const code = (r: any) => r.errors?.[0]?.extensions?.code;

beforeAll(async () => {
  server = createApolloServer();
  await ensureIndexes(User, Project, Issue, Comment);
});

beforeEach(async () => {
  await resetDb();
  ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev', password: 'ada-password' });
  grace = await User.create({ name: 'Grace', email: 'grace@taskforge.dev', password: 'grace-password' });
  linus = await User.create({ name: 'Linus', email: 'linus@taskforge.dev', password: 'linus-password' });
  admin = await User.create({ name: 'Root', email: 'root@taskforge.dev', role: 'ADMIN' });
  // Ada owns TF; Grace is a member; Linus is an outsider.
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id, grace._id] });
  // Created the way the app creates issues, so the per-project counter stays in sync.
  issue = await (Issue as any).createInProject(String(tf._id), { title: 'Login page', reporter: grace._id });
});

describe('context', () => {
  test('a valid Bearer token → currentUser (scheme case-insensitive)', async () => {
    for (const h of [`Bearer ${tokenOf(ada)}`, `bearer ${tokenOf(ada)}`]) {
      const ctx: any = await buildContext({ req: { headers: { authorization: h } } });
      expect(ctx.currentUser?.name).toBe('Ada');
    }
  }, { hint: 'Split the header into scheme and token; verifyToken(token) → { userId }.' });

  test('no header, garbage, expired tokens or deleted users → anonymous, never throws', async () => {
    const expired = signToken(String(ada._id), -10);
    const ghost = signToken(String(new mongoose.Types.ObjectId()));
    const tampered = tokenOf(ada).replace(/^./, 'x');
    for (const h of [undefined, '', 'Bearer', 'Bearer nonsense', `Basic ${tokenOf(ada)}`, `Bearer ${expired}`, `Bearer ${ghost}`, `Bearer ${tampered}`]) {
      const ctx: any = await buildContext({ req: { headers: { authorization: h } } });
      expect(ctx.currentUser ?? null).toBeNull();
    }
  });
});

describe('sign up and log in', () => {
  const SIGNUP = 'mutation($input: SignUpInput!) { signUp(input: $input) { token user { name email } } }';
  const LOGIN = 'mutation($e: String!, $p: String!) { login(email: $e, password: $p) { token user { name } } }';

  test('signUp returns a working token and the user', async () => {
    const r = await as(null, SIGNUP, { input: { name: 'Margaret', email: 'margaret@taskforge.dev', password: 'apollo-guidance' } });
    expect(r.errors).toBeUndefined();
    expect(r.data.signUp.user.name).toBe('Margaret');
    const ctx: any = await buildContext({ req: { headers: { authorization: `Bearer ${r.data.signUp.token}` } } });
    expect(ctx.currentUser?.name).toBe('Margaret');
  });

  test('signUp: short password → BAD_USER_INPUT with a password field error', async () => {
    const r = await as(null, SIGNUP, { input: { name: 'M', email: 'm@taskforge.dev', password: 'short' } });
    expect(code(r)).toBe('BAD_USER_INPUT');
    expect(r.errors[0].extensions.fields.password).toBe('Password must be at least 8 characters');
  }, { hint: 'Let the model validate; map mongoose ValidationError in formatError.' });

  test('signUp: taken email → BAD_USER_INPUT naming the email field', async () => {
    const r = await as(null, SIGNUP, { input: { name: 'Ada 2', email: 'ADA@taskforge.dev', password: 'whatever-long' } });
    expect(code(r)).toBe('BAD_USER_INPUT');
    expect(r.errors[0].extensions.fields).toHaveProperty('email');
  }, { hint: 'Duplicate key errors have code 11000 and a keyValue like { email: … }.' });

  test('login: right password → token; wrong password and unknown email → the same UNAUTHENTICATED error', async () => {
    const good = await as(null, LOGIN, { e: 'Ada@taskforge.dev', p: 'ada-password' });
    expect(good.data.login.user.name).toBe('Ada');
    const wrong = await as(null, LOGIN, { e: 'ada@taskforge.dev', p: 'nope-nope' });
    const unknown = await as(null, LOGIN, { e: 'who@taskforge.dev', p: 'nope-nope' });
    expect(code(wrong)).toBe('UNAUTHENTICATED');
    expect(code(unknown)).toBe('UNAUTHENTICATED');
    expect(wrong.errors[0].message).toBe('Invalid email or password');
    expect(unknown.errors[0].message).toBe('Invalid email or password');
  });
});

describe('field-level: User.email', () => {
  test('visible to yourself and admins only', async () => {
    const Q = '{ project(key: "TF") { owner { email } } me { email } }';
    expect((await as(ada, Q)).data).toEqual({ project: { owner: { email: 'ada@taskforge.dev' } }, me: { email: 'ada@taskforge.dev' } });
    expect((await as(grace, Q)).data.project.owner.email).toBeNull();
    expect((await as(null, Q)).data).toEqual({ project: { owner: { email: null } }, me: null });
    expect((await as(admin, Q)).data.project.owner.email).toBe('ada@taskforge.dev');
  }, { hint: 'A User.email resolver: return null (do not throw) when it is not your email and you are not an admin.' });
});

describe('operation-level: mutations need a user', () => {
  test('anonymous mutations → UNAUTHENTICATED; queries stay public', async () => {
    expect(code(await as(null, 'mutation { createProject(input: { key: "XX", name: "X" }) { id } }'))).toBe('UNAUTHENTICATED');
    expect(code(await as(null, 'mutation($id: ID!) { updateIssue(id: $id, input: { status: DONE }) { id } }', { id: String(issue._id) }))).toBe('UNAUTHENTICATED');
    expect(code(await as(null, 'mutation($id: ID!) { addComment(issueId: $id, body: "hi") { id } }', { id: String(issue._id) }))).toBe('UNAUTHENTICATED');
    const r = await as(null, '{ projects { key } }');
    expect(r.data.projects).toEqual([{ key: 'TF' }]);
  });

  test('createProject uses the current user as owner', async () => {
    const r = await as(linus, 'mutation { createProject(input: { key: "LIN", name: "Linux" }) { owner { name } members { name } } }');
    expect(r.data.createProject).toEqual({ owner: { name: 'Linus' }, members: [{ name: 'Linus' }] });
  });
});

describe('object-level: project membership', () => {
  test('permissions.canWriteProject', () => {
    expect(permissions.canWriteProject(ada, tf)).toBe(true);
    expect(permissions.canWriteProject(grace, tf)).toBe(true);
    expect(permissions.canWriteProject(linus, tf)).toBe(false);
    expect(permissions.canWriteProject(admin, tf)).toBe(true);
    expect(permissions.canWriteProject(null, tf)).toBe(false);
  });

  test('createIssue: members yes, outsiders FORBIDDEN, unknown project NOT_FOUND', async () => {
    const q = 'mutation($p: ID!) { createIssue(input: { projectId: $p, title: "From a member" }) { reporter { name } } }';
    expect((await as(grace, q, { p: String(tf._id) })).data.createIssue.reporter.name).toBe('Grace');
    expect(code(await as(linus, q, { p: String(tf._id) }))).toBe('FORBIDDEN');
    expect(code(await as(ada, q, { p: String(new mongoose.Types.ObjectId()) }))).toBe('NOT_FOUND');
  }, { hint: 'assertCanWriteProject(user, projectId) before creating.' });

  test('updateIssue / addLabel / addComment: outsiders FORBIDDEN, members OK', async () => {
    const id = String(issue._id);
    expect(code(await as(linus, 'mutation($id: ID!) { updateIssue(id: $id, input: { status: DONE }) { id } }', { id }))).toBe('FORBIDDEN');
    expect(code(await as(linus, 'mutation($id: ID!) { addLabel(issueId: $id, label: { name: "x" }) { id } }', { id }))).toBe('FORBIDDEN');
    expect(code(await as(linus, 'mutation($id: ID!) { addComment(issueId: $id, body: "x") { id } }', { id }))).toBe('FORBIDDEN');
    expect((await Issue.findById(id))!.status).toBe('TODO');
    const ok = await as(ada, 'mutation($id: ID!) { updateIssue(id: $id, input: { status: DONE }) { status } }', { id });
    expect(ok.data.updateIssue.status).toBe('DONE');
    const c = await as(grace, 'mutation($id: ID!) { addComment(issueId: $id, body: "done!") { author { name } } }', { id });
    expect(c.data.addComment.author.name).toBe('Grace');
  });

  test('order of checks: unknown issue → NOT_FOUND (for logged-in users)', async () => {
    expect(code(await as(linus, 'mutation($id: ID!) { updateIssue(id: $id, input: { status: DONE }) { id } }', { id: String(new mongoose.Types.ObjectId()) }))).toBe('NOT_FOUND');
  });

  test('addMember: owner or admin only', async () => {
    const q = 'mutation($p: ID!, $u: ID!) { addMember(projectId: $p, userId: $u) { members { name } } }';
    const v = { p: String(tf._id), u: String(linus._id) };
    expect(code(await as(grace, q, v))).toBe('FORBIDDEN');
    expect((await as(ada, q, v)).data.addMember.members.map((m: any) => m.name)).toContain('Linus');
    expect(code(await as(ada, q, { p: String(new mongoose.Types.ObjectId()), u: String(linus._id) }))).toBe('NOT_FOUND');
  });

  test('deleteIssue: reporter, project owner or admin — not other members', async () => {
    const other = await (Issue as any).createInProject(String(tf._id), { title: 'By Ada', reporter: ada._id });
    const q = 'mutation($id: ID!) { deleteIssue(id: $id) }';
    expect(code(await as(grace, q, { id: String(other._id) }))).toBe('FORBIDDEN'); // member, not reporter/owner
    expect((await as(grace, q, { id: String(issue._id) })).data.deleteIssue).toBe(String(issue._id)); // reporter
    expect((await as(ada, q, { id: String(other._id) })).data.deleteIssue).toBe(String(other._id)); // owner
    expect(await Issue.countDocuments()).toBe(0);
  });
});

describe('errors module', () => {
  test('helpers produce the right codes', () => {
    const e: any = errors;
    expect(e.badInput('x').extensions.code).toBe('BAD_USER_INPUT');
    expect(e.unauthenticated().extensions.code).toBe('UNAUTHENTICATED');
    expect(e.forbidden().extensions.code).toBe('FORBIDDEN');
    expect(e.notFound('Issue').message).toBe('Issue not found');
    expect(e.notFound('Issue').extensions.code).toBe('NOT_FOUND');
    expect(() => e.requireUser({ currentUser: null })).toThrow();
  });

  test('formatError masks unexpected errors', () => {
    const out = errors.formatError(
      { message: 'secret internals at 10.0.3.12', extensions: { code: 'INTERNAL_SERVER_ERROR', stacktrace: ['x'] } },
      new Error('secret internals at 10.0.3.12'),
    );
    expect(out.message).toBe('Internal server error');
    expect(JSON.stringify(out)).not.toContain('10.0.3.12');
    expect(JSON.stringify(out)).not.toContain('stacktrace');
  });

  test('malformed queries keep their GraphQL code', async () => {
    expect(code(await as(ada, '{ nope }'))).toBe('GRAPHQL_VALIDATION_FAILED');
  });
});

describe('errors and permissions: the less obvious paths', () => {
  test('a duplicate key names the field that actually clashed', async () => {
    const r = await as(linus, 'mutation { createProject(input: { key: "TF", name: "Copy" }) { id } }');
    expect(code(r)).toBe('BAD_USER_INPUT');
    expect(r.errors[0].extensions.fields).toHaveProperty('key');
  }, { hint: "Mongo's duplicate key error says which field clashed in keyValue." });

  test('a bad id is the caller\u2019s mistake, not a server error', () => {
    const cast = new mongoose.Error.CastError('ObjectId', 'nope', 'project');
    const out: any = (errors as any).formatError({ message: 'x', extensions: { code: 'INTERNAL_SERVER_ERROR' } }, cast);
    expect(out.extensions.code).toBe('BAD_USER_INPUT');
  }, { hint: 'Mongoose has a second error class for values it could not cast.' });

  test('the owner can write without being listed as a member', async () => {
    const side = await Project.create({ name: 'Side project', key: 'SIDE', owner: linus._id, members: [] });
    expect((permissions as any).canWriteProject(linus, side)).toBe(true);
  }, { hint: 'Admins, the owner and members can all write.' });
});
