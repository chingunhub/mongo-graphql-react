import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, ensureIndexes } from '@forge/kit';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import {
  buildIssueFilter,
  listIssues,
  countIssues,
  updateIssue,
  addLabel,
  removeLabel,
} from '../server/repositories/issues';

let ada: any, grace: any, tf: any, other: any, pid: string;
const titles = (list: any[]) => list.map((i) => i.title);

beforeAll(async () => {
  await ensureIndexes(User, Project, Issue);
});

beforeEach(async () => {
  await resetDb();
  ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev' });
  grace = await User.create({ name: 'Grace', email: 'grace@taskforge.dev' });
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id });
  other = await Project.create({ name: 'Other', key: 'OT', owner: ada._id });
  pid = String(tf._id);
  const base = new Date('2026-01-01T00:00:00Z').getTime();
  const at = (h: number) => new Date(base + h * 3600_000);
  await Issue.create([
    { project: tf._id, number: 1, title: 'Set up CI', reporter: ada._id, status: 'DONE', createdAt: at(1) },
    { project: tf._id, number: 2, title: 'Login page', reporter: ada._id, assignee: grace._id, priority: 'HIGH', createdAt: at(2), labels: [{ name: 'frontend' }] },
    { project: tf._id, number: 3, title: 'Crash on (save)', reporter: ada._id, priority: 'URGENT', createdAt: at(3), labels: [{ name: 'bug', color: '#ff0000' }] },
    { project: tf._id, number: 4, title: 'Dark mode', reporter: grace._id, assignee: ada._id, createdAt: at(4), labels: [{ name: 'frontend' }] },
    { project: other._id, number: 1, title: 'Other project issue', reporter: ada._id, createdAt: at(5) },
  ]);
  // timestamps: true overwrites updatedAt on save, so set it directly in MongoDB.
  for (const [n, h] of [[1, 9], [2, 3], [3, 4], [4, 5]]) {
    await Issue.collection.updateOne({ project: tf._id, number: n }, { $set: { updatedAt: at(h) } });
  }
});

describe('buildIssueFilter / listIssues', () => {
  test('always scoped to the project', async () => {
    expect(await listIssues(pid)).toHaveLength(4);
    expect(buildIssueFilter(pid)).toEqual({ project: pid });
  });

  test('default sort is NEWEST first', async () => {
    expect(titles(await listIssues(pid))).toEqual(['Dark mode', 'Crash on (save)', 'Login page', 'Set up CI']);
  });

  test('OLDEST and UPDATED sorts', async () => {
    expect(titles(await listIssues(pid, {}, { sort: 'OLDEST' }))[0]).toBe('Set up CI');
    expect(titles(await listIssues(pid, {}, { sort: 'UPDATED' }))).toEqual([
      'Set up CI',
      'Dark mode',
      'Crash on (save)',
      'Login page',
    ]);
  });

  test('returns Mongoose documents (with the id virtual)', async () => {
    const [first]: any[] = await listIssues(pid);
    expect(first instanceof mongoose.Document).toBe(true);
    expect(typeof first.id).toBe('string');
  }, { hint: "Don't use .lean() here — the API layer needs virtuals." });

  test('status and priority filters', async () => {
    expect(titles(await listIssues(pid, { status: 'DONE' }))).toEqual(['Set up CI']);
    expect(titles(await listIssues(pid, { priority: 'URGENT' }))).toEqual(['Crash on (save)']);
  });

  test('assigneeId: an id filters to that user', async () => {
    expect(titles(await listIssues(pid, { assigneeId: String(grace._id) }))).toEqual(['Login page']);
  });

  test('assigneeId: null means unassigned; undefined means no filter', async () => {
    expect(titles(await listIssues(pid, { assigneeId: null })).sort()).toEqual(['Crash on (save)', 'Set up CI']);
    expect(await listIssues(pid, { assigneeId: undefined })).toHaveLength(4);
    expect(buildIssueFilter(pid, { assigneeId: undefined })).not.toHaveProperty('assignee');
  }, { hint: 'Test `!== undefined`, not truthiness — null must still filter.' });

  test('label filter is case-insensitive', async () => {
    expect(titles(await listIssues(pid, { label: 'Frontend' })).sort()).toEqual(['Dark mode', 'Login page']);
  });

  test('search is case-insensitive and literal', async () => {
    expect(titles(await listIssues(pid, { search: 'LOGIN' }))).toEqual(['Login page']);
    expect(titles(await listIssues(pid, { search: '(save' }))).toEqual(['Crash on (save)']);
    expect(await listIssues(pid, { search: '.*' })).toHaveLength(0);
  }, { hint: 'Escape regex characters from the search text.' });

  test('limit and offset, with a stable order', async () => {
    expect(titles(await listIssues(pid, {}, { limit: 2, offset: 1 }))).toEqual(['Crash on (save)', 'Login page']);
    const many = await listIssues(pid, {}, { limit: 1000 });
    expect(many).toHaveLength(4);
  });

  test('limit defaults to 20 and is capped at 100', async () => {
    await Issue.create(
      Array.from({ length: 120 }, (_, i) => ({ project: tf._id, number: 100 + i, title: 'Bulk ' + i, reporter: ada._id })),
    );
    expect(await listIssues(pid)).toHaveLength(20);
    expect(await listIssues(pid, {}, { limit: 500 })).toHaveLength(100);
    // MongoDB reads limit(0) as "no limit", which would slip past the cap.
    expect((await listIssues(pid, {}, { limit: 0 })).length).toBeLessThanOrEqual(100);
  });

  test('ties on createdAt still page without duplicates', async () => {
    await Issue.deleteMany({});
    const same = new Date('2026-02-01T00:00:00Z');
    await Issue.create(
      Array.from({ length: 9 }, (_, i) => ({ project: tf._id, number: i + 1, title: 'Tie ' + i, reporter: ada._id, createdAt: same })),
    );
    const seen: string[] = [];
    for (let offset = 0; offset < 9; offset += 2) seen.push(...titles(await listIssues(pid, {}, { limit: 2, offset })));
    expect(new Set(seen).size).toBe(9);
  }, { hint: 'Add _id as a tiebreaker to every sort.' });

  test('countIssues uses the same filters', async () => {
    expect(await countIssues(pid)).toBe(4);
    expect(await countIssues(pid, { label: 'frontend' })).toBe(2);
    expect(await countIssues(pid, { assigneeId: null })).toBe(2);
  });
});

describe('updateIssue', () => {
  const issueId = async (n: number) => String((await Issue.findOne({ project: tf._id, number: n }))!._id);

  test('applies allowed fields and returns the updated issue', async () => {
    const updated: any = await updateIssue(await issueId(2), { status: 'IN_REVIEW', title: 'Login page v2' });
    expect(updated.status).toBe('IN_REVIEW');
    expect(updated.title).toBe('Login page v2');
  }, { hint: 'returnDocument: "after"' });

  test('ignores fields that are not allowed', async () => {
    const id = await issueId(2);
    const updated: any = await updateIssue(id, { number: 99, project: String(other._id), reporter: String(grace._id), priority: 'LOW' } as any);
    expect(updated.number).toBe(2);
    expect(String(updated.project)).toBe(pid);
    expect(String(updated.reporter)).toBe(String(ada._id));
    expect(updated.priority).toBe('LOW');
  }, { hint: 'Copy only whitelisted keys into $set.' });

  test('undefined keys are ignored; assignee: null unassigns', async () => {
    const id = await issueId(2);
    const a: any = await updateIssue(id, { title: undefined, assignee: null });
    expect(a.title).toBe('Login page');
    expect(a.assignee).toBeNull();
    const b: any = await updateIssue(id, { assignee: String(ada._id) });
    expect(String(b.assignee)).toBe(String(ada._id));
  });

  test('schema rules still apply', async () => {
    const id = await issueId(2);
    await expect(updateIssue(id, { status: 'BLOCKED' as any })).rejects.toThrow(/status/);
    await expect(updateIssue(id, { title: 'ab' })).rejects.toThrow(/title/);
  }, { hint: 'Update queries need runValidators: true.' });

  test('returns null for a missing issue', async () => {
    expect(await updateIssue(String(new mongoose.Types.ObjectId()), { status: 'DONE' })).toBeNull();
  });
});

describe('labels', () => {
  const issueId = async (n: number) => String((await Issue.findOne({ project: tf._id, number: n }))!._id);

  test('addLabel adds a lowercased label', async () => {
    const i: any = await addLabel(await issueId(1), { name: 'DevOps', color: '#0ea5e9' });
    expect(i.toObject().labels).toEqual([{ name: 'devops', color: '#0ea5e9' }]);
  });

  test('addLabel does not add a second label with the same name', async () => {
    const id = await issueId(3);
    const i: any = await addLabel(id, { name: 'BUG', color: '#00ff00' });
    expect(i.toObject().labels).toEqual([{ name: 'bug', color: '#ff0000' }]);
  }, { hint: 'Condition on labels.name: { $ne: name } and $push.' });

  test('concurrent addLabel calls leave exactly one label', async () => {
    const id = await issueId(1);
    await Promise.all(Array.from({ length: 8 }, () => addLabel(id, { name: 'perf' })));
    const fresh: any = await Issue.findById(id);
    expect(fresh.labels.filter((l: any) => l.name === 'perf')).toHaveLength(1);
  }, { hint: 'Loading the issue, checking in JS, then saving has a race window.' });

  test('removeLabel removes by name, case-insensitively', async () => {
    const i: any = await removeLabel(await issueId(3), 'Bug');
    expect([...i.labels]).toHaveLength(0);
  });

  test('both return null for a missing issue', async () => {
    const missing = String(new mongoose.Types.ObjectId());
    expect(await addLabel(missing, { name: 'x' })).toBeNull();
    expect(await removeLabel(missing, 'x')).toBeNull();
  });
});
