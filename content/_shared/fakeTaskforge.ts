// An in-memory Taskforge GraphQL API for testing React components.
// Same schema as the real server (client-visible parts), deterministic data, and a log of mutations.
// Copied into each React task's tests/ folder by scripts/sync-shared.ts — edit it here.

export const typeDefs = /* GraphQL */ `
  enum Role { MEMBER ADMIN }
  enum IssueStatus { TODO IN_PROGRESS IN_REVIEW DONE }
  enum Priority { LOW MEDIUM HIGH URGENT }
  enum IssueSort { NEWEST OLDEST UPDATED }

  type User { id: ID!  name: String!  email: String  role: Role! }
  type Label { name: String!  color: String! }
  type Comment { id: ID!  body: String!  author: User!  createdAt: String! }

  type Issue {
    id: ID!
    number: Int!
    key: String!
    title: String!
    description: String!
    status: IssueStatus!
    priority: Priority!
    labels: [Label!]!
    project: Project!
    reporter: User!
    assignee: User
    comments: [Comment!]!
    commentCount: Int!
    createdAt: String!
    updatedAt: String!
    dueDate: String
    isOverdue: Boolean!
  }

  type StatusCount { status: IssueStatus!  count: Int! }
  type Workload { user: User!  open: Int! }
  type ProjectStats { total: Int!  byStatus: [StatusCount!]!  workload: [Workload!]! }
  type PageInfo { hasNextPage: Boolean!  endCursor: String }
  type IssueEdge { cursor: String!  node: Issue! }
  type IssueConnection { edges: [IssueEdge!]!  pageInfo: PageInfo!  totalCount: Int! }

  input IssueFilter { status: IssueStatus  priority: Priority  assigneeId: ID  label: String  search: String  overdue: Boolean }

  type Project {
    id: ID!
    key: String!
    name: String!
    description: String!
    owner: User!
    members: [User!]!
    issues(filter: IssueFilter, sort: IssueSort = NEWEST, limit: Int = 20, offset: Int = 0): [Issue!]!
    issueCount(filter: IssueFilter): Int!
    stats: ProjectStats!
    issueConnection(filter: IssueFilter, first: Int = 20, after: String): IssueConnection!
  }

  input LabelInput { name: String!  color: String }
  input CreateIssueInput { projectId: ID!  title: String!  description: String  priority: Priority  assigneeId: ID  labels: [LabelInput!]  dueDate: String }
  input UpdateIssueInput { title: String  description: String  status: IssueStatus  priority: Priority  assigneeId: ID  dueDate: String }

  type Query {
    projects: [Project!]!
    project(key: String!): Project
    issue(id: ID!): Issue
    users: [User!]!
    me: User
  }

  type Mutation {
    createIssue(input: CreateIssueInput!): Issue!
    updateIssue(id: ID!, input: UpdateIssueInput!): Issue!
    addComment(issueId: ID!, body: String!): Comment!
  }
`;

const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const TODAY = '2026-10-16';

export interface FakeOptions {
  /** Number of issues to generate in TF (default 6). */
  issues?: number;
  /** ms to delay every resolver, so loading states are observable (default 5). */
  delay?: number;
  /** Make Query.project fail. */
  failProject?: boolean;
  /** Make Mutation.createIssue fail with this message. */
  failCreate?: string;
  /** Make Mutation.updateIssue fail with this message. */
  failUpdate?: string;
  /** Make Mutation.addComment fail with this message. */
  failComment?: string;
}

export function createFakeApi(opts: FakeOptions = {}) {
  const delay = opts.delay ?? 5;
  const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), delay));
  const calls: { field: string; args: any }[] = [];

  const users = [
    { id: 'u1', name: 'Ada Lovelace', email: 'ada@taskforge.dev', role: 'MEMBER' },
    { id: 'u2', name: 'Grace Hopper', email: 'grace@taskforge.dev', role: 'MEMBER' },
    { id: 'u3', name: 'Linus Torvalds', email: 'linus@taskforge.dev', role: 'MEMBER' },
  ];
  const projects = [
    { id: 'p1', key: 'TF', name: 'Taskforge', description: 'The tracker', owner: 'u1', members: ['u1', 'u2', 'u3'] },
    { id: 'p2', key: 'AGC', name: 'Apollo Guidance', description: '', owner: 'u2', members: ['u2'] },
  ];
  const titles = ['Set up CI', 'Login page', 'Dark mode', 'Export to CSV', 'Keyboard shortcuts', 'Fix crash on save', 'Search box', 'Avatars', 'Activity feed', 'Docs', 'Invite flow', 'Empty states'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const n = opts.issues ?? 6;
  const issues: any[] = Array.from({ length: n }, (_, i) => ({
    id: `i${i + 1}`,
    number: i + 1,
    project: 'p1',
    title: titles[i % titles.length] + (i >= titles.length ? ` ${i + 1}` : ''),
    description: '',
    status: STATUSES[i % 4],
    priority: priorities[(i * 3) % 4],
    labels: i % 2 ? [{ name: 'frontend', color: '#0ea5e9' }] : [],
    reporter: 'u1',
    assignee: i % 3 === 0 ? null : users[i % 3].id,
    createdAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
    dueDate: i === 1 ? '2026-10-01' : i === 2 ? '2026-12-24' : null,
  }));
  issues.push({
    id: 'a1', number: 1, project: 'p2', title: 'Restart protection', description: '', status: 'DONE', priority: 'URGENT',
    labels: [], reporter: 'u2', assignee: 'u2', createdAt: new Date(Date.UTC(2026, 7, 1)).toISOString(), dueDate: null,
  });
  const comments: any[] = [
    { id: 'c1', issue: 'i2', author: 'u2', body: 'On it', createdAt: '2026-09-03T10:00:00.000Z' },
    { id: 'c2', issue: 'i2', author: 'u1', body: 'Thanks!', createdAt: '2026-09-03T11:00:00.000Z' },
  ];

  const userById = (id: string | null) => users.find((u) => u.id === id) ?? null;
  const projectById = (id: string) => projects.find((p) => p.id === id)!;
  const matches = (i: any, f: any = {}) =>
    (!f.status || i.status === f.status) &&
    (!f.priority || i.priority === f.priority) &&
    (f.assigneeId === undefined || i.assignee === f.assigneeId) &&
    (!f.label || i.labels.some((l: any) => l.name === f.label)) &&
    (!f.search || i.title.toLowerCase().includes(String(f.search).toLowerCase())) &&
    (!f.overdue || (i.dueDate && i.status !== 'DONE' && i.dueDate < TODAY));
  const newestFirst = (a: any, b: any) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id));
  const projectIssues = (p: any, filter?: any) => issues.filter((i) => i.project === p.id && matches(i, filter ?? {})).sort(newestFirst);
  const encode = (i: any) => Buffer.from(i.id).toString('base64');
  const decode = (c: string) => Buffer.from(c, 'base64').toString('utf8');

  const resolvers = {
    Query: {
      projects: () => wait(projects),
      project: (_: unknown, { key }: { key: string }) => {
        calls.push({ field: 'project', args: { key } });
        if (opts.failProject) return wait(null).then(() => { throw new Error('Database unavailable'); });
        return wait(projects.find((p) => p.key === key.toUpperCase()) ?? null);
      },
      issue: (_: unknown, { id }: { id: string }) => wait(issues.find((i) => i.id === id) ?? null),
      users: () => wait(users),
      me: () => wait(users[0]),
    },
    Mutation: {
      createIssue: async (_: unknown, { input }: { input: any }) => {
        calls.push({ field: 'createIssue', args: { input } });
        await wait(null);
        if (opts.failCreate) throw new Error(opts.failCreate);
        const p = projectById(input.projectId);
        if (!p) throw new Error('Project not found');
        if (!input.title || input.title.trim().length < 3) throw new Error('Invalid input');
        const number = Math.max(0, ...issues.filter((i) => i.project === p.id).map((i) => i.number)) + 1;
        const issue = {
          id: `new${number}`, number, project: p.id, title: input.title.trim(), description: input.description ?? '',
          status: 'TODO', priority: input.priority ?? 'MEDIUM', labels: input.labels ?? [], reporter: 'u1',
          assignee: input.assigneeId ?? null, createdAt: new Date(Date.UTC(2026, 9, 1, issues.length)).toISOString(),
          dueDate: input.dueDate ?? null,
        };
        issues.push(issue);
        return issue;
      },
      updateIssue: async (_: unknown, { id, input }: { id: string; input: any }) => {
        calls.push({ field: 'updateIssue', args: { id, input } });
        await wait(null);
        if (opts.failUpdate) throw new Error(opts.failUpdate);
        const issue = issues.find((i) => i.id === id);
        if (!issue) throw new Error('Issue not found');
        for (const [k, v] of Object.entries(input)) {
          if (v === undefined) continue;
          if (k === 'assigneeId') issue.assignee = v;
          else issue[k] = v;
        }
        return issue;
      },
      addComment: async (_: unknown, { issueId, body }: { issueId: string; body: string }) => {
        calls.push({ field: 'addComment', args: { issueId, body } });
        await wait(null);
        if (opts.failComment) throw new Error(opts.failComment);
        const c = { id: `c${comments.length + 1}`, issue: issueId, author: 'u1', body, createdAt: new Date(Date.UTC(2026, 9, 2, comments.length)).toISOString() };
        comments.push(c);
        return c;
      },
    },
    Project: {
      owner: (p: any) => userById(p.owner),
      members: (p: any) => p.members.map(userById),
      issues: (p: any, { filter, limit = 20, offset = 0 }: any) => {
        calls.push({ field: 'Project.issues', args: { filter, limit, offset } });
        return wait(projectIssues(p, filter).slice(offset, offset + limit));
      },
      issueCount: (p: any, { filter }: any) => projectIssues(p, filter).length,
      stats: (p: any) => {
        const all = projectIssues(p);
        return {
          total: all.length,
          byStatus: STATUSES.map((status) => ({ status, count: all.filter((i) => i.status === status).length })),
          workload: [],
        };
      },
      issueConnection: (p: any, { filter, first = 20, after }: any) => {
        calls.push({ field: 'Project.issueConnection', args: { filter, first, after } });
        let list = projectIssues(p, filter);
        if (after) {
          const idx = list.findIndex((i) => i.id === decode(after));
          list = list.slice(idx + 1);
        }
        const page = list.slice(0, first);
        return wait({
          edges: page.map((node) => ({ cursor: encode(node), node })),
          pageInfo: { hasNextPage: list.length > first, endCursor: page.length ? encode(page[page.length - 1]) : null },
          totalCount: projectIssues(p, filter).length,
        });
      },
    },
    Issue: {
      key: (i: any) => `${projectById(i.project).key}-${i.number}`,
      project: (i: any) => projectById(i.project),
      reporter: (i: any) => userById(i.reporter),
      assignee: (i: any) => userById(i.assignee),
      comments: (i: any) => comments.filter((c) => c.issue === i.id),
      commentCount: (i: any) => comments.filter((c) => c.issue === i.id).length,
      updatedAt: (i: any) => i.createdAt,
      isOverdue: (i: any) => !!i.dueDate && i.status !== 'DONE' && i.dueDate < TODAY,
    },
    Comment: {
      author: (c: any) => userById(c.author),
    },
  };

  return { typeDefs, resolvers, calls, data: { users, projects, issues, comments } };
}
