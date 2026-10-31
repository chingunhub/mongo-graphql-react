import { expect } from 'expect';
import mongoose from 'mongoose';
import { resetDb, ensureIndexes, countQueries } from '@forge/kit';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Counter, nextSequence } from '../server/models/Counter';
import { projectStats, workload } from '../server/services/stats';

const I = Issue as any;
let ada: any, grace: any, linus: any, tf: any, api: any;

beforeAll(async () => {
  await ensureIndexes(User, Project, Issue);
});

beforeEach(async () => {
  await resetDb();
  [ada, grace, linus] = await User.create([
    { name: 'Ada', email: 'ada@taskforge.dev' },
    { name: 'Grace', email: 'grace@taskforge.dev' },
    { name: 'Linus', email: 'linus@taskforge.dev' },
  ]);
  tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id });
  api = await Project.create({ name: 'API', key: 'API', owner: ada._id });
});

describe('Counter', () => {
  test('nextSequence counts 1, 2, 3 per name', async () => {
    expect(await nextSequence('a')).toBe(1);
    expect(await nextSequence('a')).toBe(2);
    expect(await nextSequence('b')).toBe(1);
    expect(await nextSequence('a')).toBe(3);
  }, { hint: 'findOneAndUpdate with $inc, upsert: true, returnDocument: "after".' });

  test('counter documents use the name as a string _id', async () => {
    await nextSequence('issue:xyz');
    const doc = await Counter.collection.findOne({ _id: 'issue:xyz' as any });
    expect(doc?.seq).toBe(1);
  }, { hint: '_id: { type: String } in the schema.' });

  test('concurrent calls never return the same number', async () => {
    const nums = await Promise.all(Array.from({ length: 25 }, () => nextSequence('race')));
    expect([...nums].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });
});

describe('Issue.createInProject', () => {
  test('numbers issues per project', async () => {
    const a1 = await I.createInProject(String(tf._id), { title: 'First', reporter: ada._id });
    const a2 = await I.createInProject(String(tf._id), { title: 'Second', reporter: ada._id });
    const b1 = await I.createInProject(String(api._id), { title: 'Other', reporter: ada._id });
    expect([a1.number, a2.number, b1.number]).toEqual([1, 2, 1]);
    expect(String(a1.project)).toBe(String(tf._id));
  });

  test('ignores number/project passed in data', async () => {
    const i = await I.createInProject(String(tf._id), { title: 'Sneaky', reporter: ada._id, number: 99, project: api._id });
    expect(i.number).toBe(1);
    expect(String(i.project)).toBe(String(tf._id));
  }, { hint: 'Spread data first, then set project and number.' });

  test('20 concurrent creates get 1..20 with no duplicate-key errors', async () => {
    const issues = await Promise.all(
      Array.from({ length: 20 }, (_, i) => I.createInProject(String(tf._id), { title: 'Concurrent ' + i, reporter: ada._id })),
    );
    expect(issues.map((x: any) => x.number).sort((a: number, b: number) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  }, { hint: '"find max + 1" races. The counter must be the source of numbers.' });

  test('still validates the issue', async () => {
    await expect(I.createInProject(String(tf._id), { title: 'x', reporter: ada._id })).rejects.toThrow(/title/);
  });
});

async function seedIssues() {
  const mk = (n: number, status: string, assignee: any = null, project = tf._id) => ({
    project, number: n, title: 'Issue ' + n, reporter: ada._id, status, assignee,
  });
  await Issue.create([
    mk(1, 'TODO', grace._id),
    mk(2, 'TODO', grace._id),
    mk(3, 'TODO'),
    mk(4, 'IN_PROGRESS', grace._id),
    mk(5, 'IN_PROGRESS', ada._id),
    mk(6, 'DONE', ada._id),
    mk(7, 'DONE', linus._id),
    mk(1, 'TODO', linus._id, api._id),
  ]);
}

describe('projectStats', () => {
  test('counts per status, in board order, including zeros', async () => {
    await seedIssues();
    expect(await projectStats(String(tf._id))).toEqual({
      total: 7,
      byStatus: [
        { status: 'TODO', count: 3 },
        { status: 'IN_PROGRESS', count: 2 },
        { status: 'IN_REVIEW', count: 0 },
        { status: 'DONE', count: 2 },
      ],
    });
  }, { hint: 'An empty result usually means a string id in $match. Cast with new mongoose.Types.ObjectId(projectId).' });

  test('a project with no issues', async () => {
    const r = await projectStats(String(new mongoose.Types.ObjectId()));
    expect(r.total).toBe(0);
    expect(r.byStatus.map((s) => s.count)).toEqual([0, 0, 0, 0]);
  });

  test('uses one aggregation', async () => {
    await seedIssues();
    const { count, ops } = await countQueries(() => projectStats(String(tf._id)));
    expect(count).toBe(1);
    expect(ops[0].method).toBe('aggregate');
  });
});

describe('workload', () => {
  test('open issues per assignee with names, sorted', async () => {
    await seedIssues();
    expect(await workload(String(tf._id))).toEqual([
      { userId: String(grace._id), name: 'Grace', open: 3 },
      { userId: String(ada._id), name: 'Ada', open: 1 },
    ]);
  }, { hint: 'Exclude DONE and unassigned in $match; $lookup from "users"; $toString for userId.' });

  test('ties are sorted by name', async () => {
    await Issue.create([
      { project: tf._id, number: 1, title: 'Issue 1', reporter: ada._id, assignee: linus._id },
      { project: tf._id, number: 2, title: 'Issue 2', reporter: ada._id, assignee: ada._id },
    ]);
    expect((await workload(String(tf._id))).map((w) => w.name)).toEqual(['Ada', 'Linus']);
  });

  test('a bigger tie still comes back A→Z', async () => {
    const names = ['Zed', 'Yara', 'Wes', 'Uma', 'Sam', 'Quinn'];
    const users = await User.create(names.map((name) => ({ name, email: `${name.toLowerCase()}@taskforge.dev` })));
    await Issue.create(users.map((u: any, i: number) => ({ project: tf._id, number: i + 1, title: `Issue ${i + 1}`, reporter: ada._id, assignee: u._id })));
    expect((await workload(String(tf._id))).map((w) => w.name)).toEqual([...names].sort());
  }, { hint: 'Two rows with the same count still need an order.' });
});
