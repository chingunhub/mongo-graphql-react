import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, execute } from '@forge/kit';
import { createServer } from '../server';
import { buildContext } from '../context';
import { formatError } from '../errors';
import { User } from '../models/User';
import { Note } from '../models/Note';

const server = createServer();
let sam: any, kai: any, samPrivate: any, samShared: any, kaiPrivate: any;

async function as(authorization: string | undefined, query: string, variables?: Record<string, unknown>) {
  const ctx = await buildContext({ req: { headers: { authorization } } });
  return execute(server, query, variables, ctx) as Promise<any>;
}
const code = (r: any) => r.errors?.[0]?.extensions?.code;
const SAM = 'ApiKey key-sam';
const KAI = 'ApiKey key-kai';

beforeEach(async () => {
  await resetDb();
  [sam, kai] = await User.create([
    { name: 'Sam', apiKey: 'key-sam' },
    { name: 'Kai', apiKey: 'key-kai' },
  ]);
  samPrivate = await Note.create({ owner: sam._id, title: 'Diary', createdAt: new Date('2026-01-01') });
  samShared = await Note.create({ owner: sam._id, title: 'Groceries', shared: true, createdAt: new Date('2026-01-02') });
  kaiPrivate = await Note.create({ owner: kai._id, title: 'Kai secret' });
});

describe('buildContext', () => {
  test('ApiKey header → the matching user (scheme is case-insensitive)', async () => {
    for (const h of ['ApiKey key-sam', 'apikey key-sam', 'APIKEY key-sam']) {
      const ctx = await buildContext({ req: { headers: { authorization: h } } });
      expect(ctx.currentUser?.name).toBe('Sam');
    }
  });

  test('missing header, other schemes and unknown keys → null, without throwing', async () => {
    for (const h of [undefined, '', 'Bearer key-sam', 'ApiKey nope', 'ApiKey', 'key-sam']) {
      const ctx = await buildContext({ req: { headers: { authorization: h } } });
      expect(ctx.currentUser ?? null).toBeNull();
    }
  });
});

describe('queries', () => {
  test('myNotes requires login', async () => {
    expect(code(await as(undefined, '{ myNotes { title } }'))).toBe('UNAUTHENTICATED');
  }, { hint: 'requireUser(ctx) at the top of the resolver: throw unauthenticated() when there is no user.' });

  test('myNotes: only mine, newest first', async () => {
    const r = await as(SAM, '{ myNotes { title owner { name } } }');
    expect(r.data.myNotes).toEqual([
      { title: 'Groceries', owner: { name: 'Sam' } },
      { title: 'Diary', owner: { name: 'Sam' } },
    ]);
  });

  test('note(id): shared notes are public; private ones only for the owner', async () => {
    const q = 'query($id: ID!) { note(id: $id) { title createdAt } }';
    expect((await as(undefined, q, { id: String(samShared._id) })).data.note.title).toBe('Groceries');
    expect((await as(KAI, q, { id: String(samPrivate._id) })).data.note).toBeNull();
    expect((await as(undefined, q, { id: String(samPrivate._id) })).data.note).toBeNull();
    const own = await as(SAM, q, { id: String(samPrivate._id) });
    expect(own.data.note.title).toBe('Diary');
    expect(own.data.note.createdAt).toBe('2026-01-01T00:00:00.000Z');
  }, { hint: 'One canSee(note, user) helper: shared || owner.' });

  test('note(id) with unknown or malformed ids → null, no error', async () => {
    const r = await as(SAM, '{ a: note(id: "nope") { title } }');
    expect(r.errors).toBeUndefined();
    expect(r.data.a).toBeNull();
  });
});

describe('mutations', () => {
  test('createNote requires login and makes me the owner', async () => {
    expect(code(await as(undefined, 'mutation { createNote(input: { title: "x" }) { id } }'))).toBe('UNAUTHENTICATED');
    const r = await as(KAI, 'mutation { createNote(input: { title: "Ideas", shared: true }) { title shared owner { name } } }');
    expect(r.data.createNote).toEqual({ title: 'Ideas', shared: true, owner: { name: 'Kai' } });
  });

  test('invalid input → BAD_USER_INPUT with field messages', async () => {
    const r = await as(SAM, 'mutation { createNote(input: { title: "" }) { id } }');
    expect(r.errors[0].message).toBe('Invalid input');
    expect(r.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(r.errors[0].extensions.fields).toEqual({ title: 'Title is required' });
  }, { hint: 'formatError: unwrapResolverError(error) instanceof mongoose.Error.ValidationError.' });

  test('updateNote: owner can edit', async () => {
    const r = await as(SAM, 'mutation($id: ID!) { updateNote(id: $id, input: { title: "Dear diary" }) { title shared } }', { id: String(samPrivate._id) });
    expect(r.data.updateNote).toEqual({ title: 'Dear diary', shared: false });
  });

  test('updateNote: someone else’s private note → NOT_FOUND (do not reveal it exists)', async () => {
    const r = await as(KAI, 'mutation($id: ID!) { updateNote(id: $id, input: { title: "hacked" }) { title } }', { id: String(samPrivate._id) });
    expect(code(r)).toBe('NOT_FOUND');
    expect((await Note.findById(samPrivate._id))!.title).toBe('Diary');
  });

  test('updateNote: someone else’s shared note → FORBIDDEN', async () => {
    const r = await as(KAI, 'mutation($id: ID!) { updateNote(id: $id, input: { title: "hacked" }) { title } }', { id: String(samShared._id) });
    expect(code(r)).toBe('FORBIDDEN');
    expect((await Note.findById(samShared._id))!.title).toBe('Groceries');
  }, { hint: 'Visible but not mine → forbidden(). Invisible → notFound().' });

  test('updateNote requires login; unknown ids → NOT_FOUND', async () => {
    expect(code(await as(undefined, 'mutation($id: ID!) { updateNote(id: $id, input: { title: "x" }) { id } }', { id: String(samShared._id) }))).toBe('UNAUTHENTICATED');
    expect(code(await as(SAM, 'mutation { updateNote(id: "nope", input: { title: "x" }) { id } }'))).toBe('NOT_FOUND');
  });

  test('deleteNote follows the same rules', async () => {
    expect(code(await as(KAI, 'mutation($id: ID!) { deleteNote(id: $id) }', { id: String(samShared._id) }))).toBe('FORBIDDEN');
    expect(code(await as(KAI, 'mutation($id: ID!) { deleteNote(id: $id) }', { id: String(samPrivate._id) }))).toBe('NOT_FOUND');
    const r = await as(KAI, 'mutation($id: ID!) { deleteNote(id: $id) }', { id: String(kaiPrivate._id) });
    expect(r.data.deleteNote).toBe(String(kaiPrivate._id));
    expect(await Note.countDocuments()).toBe(2);
  });
});

describe('formatError', () => {
  test('masks unexpected errors', () => {
    const out = formatError(
      { message: 'connect ECONNREFUSED 10.0.3.12:27017', extensions: { code: 'INTERNAL_SERVER_ERROR' } },
      new Error('connect ECONNREFUSED 10.0.3.12:27017'),
    );
    expect(out.message).toBe('Internal server error');
    expect(out.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(out)).not.toContain('10.0.3.12');
  }, { hint: 'Return a brand-new object — no original message, no stacktrace.' });

  test('passes known errors through unchanged', () => {
    const formatted = { message: 'Note not found', extensions: { code: 'NOT_FOUND' } };
    expect(formatError(formatted, new Error('x'))).toEqual(formatted);
  });

  test('does not mistake GraphQL validation errors for Mongoose ones', async () => {
    const r = await as(SAM, '{ nope }');
    expect(code(r)).toBe('GRAPHQL_VALIDATION_FAILED');
  }, { hint: 'Use instanceof mongoose.Error.ValidationError, not err.name.' });
});
