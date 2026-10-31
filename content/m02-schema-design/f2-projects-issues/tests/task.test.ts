import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, ensureIndexes, isDuplicateKeyError } from '@forge/kit';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue, STATUSES, PRIORITIES } from '../server/models/Issue';

const oid = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  await ensureIndexes(User, Project, Issue);
});
beforeEach(resetDb);

const project = (over: Record<string, unknown> = {}) => ({ name: 'Taskforge', key: 'TF', owner: oid(), ...over });
const issue = (over: Record<string, unknown> = {}) => ({
  project: oid(),
  number: 1,
  title: 'Set up CI',
  reporter: oid(),
  ...over,
});

describe('Project', () => {
  test('saves with defaults: empty description, no members', async () => {
    const p: any = await Project.create(project());
    expect(p.description).toBe('');
    expect([...p.members]).toEqual([]);
    expect(p.createdAt).toBeInstanceOf(Date);
  });

  test('key is trimmed and uppercased before validation', async () => {
    const p: any = await Project.create(project({ key: ' tf ' }));
    expect(p.key).toBe('TF');
  });

  test('key must be 2–5 letters (custom message)', async () => {
    for (const key of ['T', 'TASKFO', 'T1', 'T-F']) {
      await expect(Project.create(project({ key }))).rejects.toThrow('Project key must be 2–5 letters');
    }
  }, { hint: 'match: [/^[A-Z]{2,5}$/, "Project key must be 2–5 letters"]' });

  test('name is required and at most 80 characters', async () => {
    await expect(Project.create(project({ name: undefined }))).rejects.toThrow(/name/);
    await expect(Project.create(project({ name: 'x'.repeat(81) }))).rejects.toThrow(/name/);
  });

  test('owner is a required ObjectId reference to User', async () => {
    await expect(Project.create(project({ owner: undefined }))).rejects.toThrow(/owner/);
    const path: any = Project.schema.path('owner');
    expect(path.instance).toBe('ObjectId');
    expect(path.options.ref).toBe('User');
  });

  test('members is an array of ObjectId references to User', async () => {
    const a = oid();
    const p: any = await Project.create(project({ members: [a] }));
    expect(String(p.members[0])).toBe(String(a));
    const path: any = Project.schema.path('members');
    expect(path.caster?.options?.ref ?? path.options?.type?.[0]?.ref).toBe('User');
  });

  test('two projects cannot share a key (rejected by MongoDB)', async () => {
    await Project.create(project());
    expect(await isDuplicateKeyError(Project.create(project({ name: 'Other', key: 'tf' })))).toBe(true);
  }, { hint: 'unique: true on key creates a unique index.' });
});

describe('Issue', () => {
  test('exports STATUSES and PRIORITIES', () => {
    expect([...STATUSES]).toEqual(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
    expect([...PRIORITIES]).toEqual(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
  });

  test('saves with defaults: TODO, MEDIUM, no labels, no assignee, empty description', async () => {
    const i: any = await Issue.create(issue());
    expect(i.status).toBe('TODO');
    expect(i.priority).toBe('MEDIUM');
    expect([...i.labels]).toEqual([]);
    expect(i.assignee).toBeNull();
    expect(i.description).toBe('');
    expect(i.updatedAt).toBeInstanceOf(Date);
  }, { hint: 'assignee needs default: null.' });

  test('status and priority are restricted to their lists', async () => {
    await expect(Issue.create(issue({ status: 'BLOCKED' }))).rejects.toThrow(/status/);
    await expect(Issue.create(issue({ priority: 'CRITICAL' }))).rejects.toThrow(/priority/);
  });

  test('title is trimmed and 3–120 characters', async () => {
    const i: any = await Issue.create(issue({ title: '   Fix login   ' }));
    expect(i.title).toBe('Fix login');
    await expect(Issue.create(issue({ title: 'ab' }))).rejects.toThrow(/title/);
    await expect(Issue.create(issue({ title: 'x'.repeat(121) }))).rejects.toThrow(/title/);
  });

  test('project, number and reporter are required; number >= 1', async () => {
    await expect(Issue.create(issue({ project: undefined }))).rejects.toThrow(/project/);
    await expect(Issue.create(issue({ reporter: undefined }))).rejects.toThrow(/reporter/);
    await expect(Issue.create(issue({ number: undefined }))).rejects.toThrow(/number/);
    await expect(Issue.create(issue({ number: 0 }))).rejects.toThrow(/number/);
  });

  test('labels: name lowercased/trimmed, default color, and no _id', async () => {
    const i: any = await Issue.create(issue({ labels: [{ name: ' DevOps ' }] }));
    const label = i.toObject().labels[0];
    expect(label).toEqual({ name: 'devops', color: '#888888' });
  }, { hint: 'new Schema({...}, { _id: false }) for the label subdocument.' });

  test('label colors must be hex (custom message)', async () => {
    await expect(Issue.create(issue({ labels: [{ name: 'bug', color: 'red' }] }))).rejects.toThrow(
      'Color must be a hex value like #ff8800',
    );
    const ok: any = await Issue.create(issue({ labels: [{ name: 'bug', color: '#FF0044' }] }));
    expect(ok.labels[0].color).toBe('#FF0044');
  });

  test('references point to the right models', () => {
    expect((Issue.schema.path('project') as any).options.ref).toBe('Project');
    expect((Issue.schema.path('reporter') as any).options.ref).toBe('User');
    expect((Issue.schema.path('assignee') as any).options.ref).toBe('User');
  });

  test('issue numbers are unique per project, not globally', async () => {
    const tf = oid();
    const api = oid();
    await Issue.create(issue({ project: tf, number: 1 }));
    await Issue.create(issue({ project: api, number: 1 }));
    expect(await isDuplicateKeyError(Issue.create(issue({ project: tf, number: 1 })))).toBe(true);
  }, { hint: 'A compound index: issueSchema.index({ project: 1, number: 1 }, { unique: true })' });
});

describe('User (update)', () => {
  test('email is unique — even with different casing', async () => {
    await User.create({ name: 'Ada', email: 'ada@taskforge.dev' });
    expect(await isDuplicateKeyError(User.create({ name: 'Ada 2', email: 'ADA@taskforge.dev' }))).toBe(true);
  }, { hint: 'Add unique: true to email in server/models/User.ts.' });
});
