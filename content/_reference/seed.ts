// Demo data for the reference API and for "Launch my Taskforge".
// Uses the workspace's own models, so it exercises the code it seeds.
import mongoose from 'mongoose';
import { User } from '../server/models/User';
import { Project } from '../server/models/Project';
import { Issue } from '../server/models/Issue';
import { Comment } from '../server/models/Comment';

const PASSWORD = 'password123';
const BASE = Date.UTC(2026, 8, 1, 9); // 2026-09-01 09:00 UTC
const HOUR = 3600_000;

type IssueSeed = {
  title: string;
  status?: string;
  priority?: string;
  assignee?: string;
  reporter: string;
  labels?: { name: string; color: string }[];
  description?: string;
  due?: number; // days after the issue was created
  comments?: [string, string][];
};

const L = {
  bug: { name: 'bug', color: '#dc2626' },
  frontend: { name: 'frontend', color: '#0ea5e9' },
  backend: { name: 'backend', color: '#e535ab' },
  devops: { name: 'devops', color: '#13aa52' },
  ux: { name: 'ux', color: '#f97316' },
  docs: { name: 'docs', color: '#8b5cf6' },
};

const TF_ISSUES: IssueSeed[] = [
  { title: 'Set up CI pipeline', status: 'DONE', priority: 'HIGH', assignee: 'linus', reporter: 'ada', labels: [L.devops] },
  { title: 'User model with password hashing', status: 'DONE', priority: 'HIGH', assignee: 'ada', reporter: 'ada', labels: [L.backend] },
  { title: 'Project and issue schemas', status: 'DONE', priority: 'MEDIUM', assignee: 'ada', reporter: 'grace', labels: [L.backend] },
  { title: 'GraphQL schema review', status: 'DONE', priority: 'MEDIUM', assignee: 'grace', reporter: 'ada', labels: [L.backend, L.docs],
    comments: [['grace', 'Left a few nullability notes on Issue.'], ['ada', 'Applied all of them, thanks!']] },
  { title: 'Login page', status: 'IN_REVIEW', priority: 'HIGH', assignee: 'grace', reporter: 'ada', labels: [L.frontend], due: 14,
    comments: [['grace', 'PR is up — dark mode variant included.'], ['margaret', 'Tested on mobile, looks good.']] },
  { title: 'DataLoader for issue fields', status: 'DONE', priority: 'URGENT', assignee: 'linus', reporter: 'linus', labels: [L.backend],
    comments: [['linus', 'Board query went from 84 to 7 database queries.']] },
  { title: 'Crash when saving an empty title', status: 'IN_PROGRESS', priority: 'URGENT', assignee: 'linus', reporter: 'margaret', labels: [L.bug, L.backend], due: 3,
    description: 'Submitting the create form with only spaces throws a 500 instead of a validation error.' },
  { title: 'Cursor pagination on the board', status: 'IN_PROGRESS', priority: 'HIGH', assignee: 'ada', reporter: 'grace', labels: [L.backend, L.frontend] },
  { title: 'Issue detail drawer', status: 'TODO', priority: 'MEDIUM', assignee: 'grace', reporter: 'ada', labels: [L.frontend, L.ux] },
  { title: 'Optimistic status changes', status: 'IN_REVIEW', priority: 'MEDIUM', assignee: 'grace', reporter: 'grace', labels: [L.frontend] },
  { title: 'Rate-limit the login mutation', status: 'TODO', priority: 'HIGH', reporter: 'margaret', labels: [L.backend], due: 10 },
  { title: 'Search across projects', status: 'DONE', priority: 'LOW', assignee: 'ada', reporter: 'ada', labels: [L.backend] },
  { title: 'Label color picker', status: 'TODO', priority: 'LOW', reporter: 'grace', labels: [L.frontend, L.ux] },
  { title: 'Docs: running locally', status: 'TODO', priority: 'LOW', assignee: 'margaret', reporter: 'ada', labels: [L.docs] },
  { title: 'Flaky test in comments suite', status: 'TODO', priority: 'MEDIUM', assignee: 'linus', reporter: 'linus', labels: [L.bug, L.devops],
    comments: [['linus', 'Fails roughly 1 in 20 runs — timestamps colliding?'], ['ada', 'Sort needs an _id tiebreaker.']] },
  { title: 'Error codes in the API reference', status: 'IN_PROGRESS', priority: 'MEDIUM', assignee: 'margaret', reporter: 'grace', labels: [L.docs, L.backend] },
  { title: 'Empty state for new projects', status: 'TODO', priority: 'LOW', reporter: 'grace', labels: [L.ux] },
  { title: 'Member invite flow', status: 'TODO', priority: 'MEDIUM', assignee: 'ada', reporter: 'margaret', labels: [L.backend, L.frontend], due: 21 },
  { title: 'Avatars in the assignee picker', status: 'TODO', priority: 'LOW', reporter: 'grace', labels: [L.frontend] },
  { title: 'Upgrade Mongoose to v9', status: 'DONE', priority: 'MEDIUM', assignee: 'linus', reporter: 'linus', labels: [L.backend, L.devops],
    comments: [['linus', 'Pre hooks lost next() — converted them all to async.']] },
  { title: 'Activity feed per issue', status: 'TODO', priority: 'LOW', reporter: 'ada', labels: [L.backend] },
  { title: 'Slow board on large projects', status: 'IN_REVIEW', priority: 'HIGH', assignee: 'ada', reporter: 'margaret', labels: [L.bug, L.backend],
    comments: [['margaret', 'Our biggest project has 3k issues; the board takes 4s.'], ['ada', 'Index on { project, createdAt, _id } fixed it.']] },
  { title: 'Export to CSV', status: 'TODO', priority: 'MEDIUM', reporter: 'margaret', labels: [L.backend] },
  { title: 'Keyboard shortcuts', status: 'TODO', priority: 'LOW', assignee: 'grace', reporter: 'ada', labels: [L.ux, L.frontend] },
];

const AGC_ISSUES: IssueSeed[] = [
  { title: 'Restart protection for the guidance computer', status: 'DONE', priority: 'URGENT', assignee: 'margaret', reporter: 'margaret' },
  { title: 'Priority scheduling for overloaded jobs', status: 'DONE', priority: 'HIGH', assignee: 'margaret', reporter: 'alan' },
  { title: 'Document the 1202 alarm', status: 'IN_PROGRESS', priority: 'MEDIUM', assignee: 'alan', reporter: 'margaret', labels: [L.docs] },
];

const DOCS_ISSUES: IssueSeed[] = [
  { title: 'Style guide for API docs', status: 'TODO', priority: 'MEDIUM', assignee: 'grace', reporter: 'grace', labels: [L.docs] },
  { title: 'Tutorial: your first project', status: 'IN_PROGRESS', priority: 'LOW', assignee: 'ada', reporter: 'grace', labels: [L.docs] },
];

export async function seed() {
  const db = mongoose.connection.db!;
  for (const c of await db.collections()) await c.deleteMany({});

  const people = {
    ada: await User.create({ name: 'Ada Lovelace', email: 'ada@taskforge.dev', password: PASSWORD }),
    grace: await User.create({ name: 'Grace Hopper', email: 'grace@taskforge.dev', password: PASSWORD }),
    linus: await User.create({ name: 'Linus Torvalds', email: 'linus@taskforge.dev', password: PASSWORD }),
    margaret: await User.create({ name: 'Margaret Hamilton', email: 'margaret@taskforge.dev', password: PASSWORD, role: 'ADMIN' }),
    alan: await User.create({ name: 'Alan Turing', email: 'alan@taskforge.dev', password: PASSWORD }),
  } as Record<string, any>;

  const tf = await Project.create({
    key: 'TF',
    name: 'Taskforge',
    description: 'The issue tracker you are building in this course.',
    owner: people.ada._id,
    members: ['ada', 'grace', 'linus', 'margaret'].map((p) => people[p]._id),
  });
  const agc = await Project.create({
    key: 'AGC',
    name: 'Apollo Guidance',
    description: 'Flight software for the lunar module.',
    owner: people.margaret._id,
    members: [people.margaret._id, people.alan._id],
  });
  const docs = await Project.create({
    key: 'DOCS',
    name: 'Documentation',
    owner: people.grace._id,
    members: [people.grace._id, people.ada._id],
  });

  let hour = 0;
  async function createIssues(project: any, list: IssueSeed[]) {
    for (const s of list) {
      const createdAt = new Date(BASE + hour * 7 * HOUR);
      hour++;
      const issue = await (Issue as any).createInProject(String(project._id), {
        title: s.title,
        description: s.description ?? '',
        status: s.status ?? 'TODO',
        priority: s.priority ?? 'MEDIUM',
        labels: s.labels ?? [],
        reporter: people[s.reporter]._id,
        assignee: s.assignee ? people[s.assignee]._id : null,
        ...(s.due !== undefined && { dueDate: new Date(createdAt.getTime() + s.due * 24 * HOUR) }),
      });
      // Deterministic timestamps so ordering (and the lessons' examples) are stable.
      await Issue.collection.updateOne({ _id: issue._id }, { $set: { createdAt, updatedAt: createdAt } });
      let minute = 30;
      for (const [who, body] of s.comments ?? []) {
        const c = await Comment.create({ issue: issue._id, author: people[who]._id, body });
        await Comment.collection.updateOne({ _id: c._id }, { $set: { createdAt: new Date(createdAt.getTime() + minute * 60_000) } });
        minute += 45;
      }
    }
  }

  await createIssues(tf, TF_ISSUES);
  await createIssues(agc, AGC_ISSUES);
  await createIssues(docs, DOCS_ISSUES);
}
