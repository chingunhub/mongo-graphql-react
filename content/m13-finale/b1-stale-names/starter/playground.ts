import { createApolloServer } from './server/graphql/server';
import { buildContext } from './server/graphql/context';
import { User } from './server/models/User';
import { Project } from './server/models/Project';
import { Issue } from './server/models/Issue';
import { Comment } from './server/models/Comment';

const server = createApolloServer();
const ask = async (query: string, variables?: Record<string, unknown>) => {
  // A new context each time, exactly like a new request.
  const contextValue = await buildContext({ req: { headers: {} } } as any);
  const res: any = await server.executeOperation({ query, variables }, { contextValue });
  return res.body.singleResult;
};

const ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev', password: 'ada-password' });
const tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id] });
const first: any = await (Issue as any).createInProject(String(tf._id), { title: 'Write the docs', reporter: ada._id });

// INC-88
const CARD = '{ project(key: "TF") { issues { key reporter { name } commentCount } } }';
console.log('Before', JSON.stringify((await ask(CARD)).data?.project.issues));
await User.updateOne({ _id: ada._id }, { name: 'Ada Lovelace' });
await Comment.create({ issue: first._id, author: ada._id, body: 'First!' });
console.log('After the rename and a comment', JSON.stringify((await ask(CARD)).data?.project.issues));

// INC-91: a bulk import writes these seven issues in the same millisecond.
for (let i = 2; i <= 8; i++) await (Issue as any).createInProject(String(tf._id), { title: 'Imported ' + i, reporter: ada._id });
await Issue.collection.updateMany({ project: tf._id }, { $set: { createdAt: new Date('2026-10-29T09:00:00Z') } });

const PAGE = `query Page($after: String) {
  project(key: "TF") {
    issueConnection(first: 3, after: $after) {
      edges { node { number } }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
}`;
const seen: number[] = [];
let after: string | null = null;
for (let page = 1; page <= 5; page++) {
  const result = await ask(PAGE, { after });
  if (result.errors) {
    console.log('Page', page, result.errors[0].message);
    break;
  }
  const conn: any = result.data.project.issueConnection;
  const numbers = conn.edges.map((edge: any) => edge.node.number);
  console.log('Page', page, numbers);
  seen.push(...numbers);
  if (!conn.pageInfo.hasNextPage) {
    console.log('Saw', seen.length, 'of', conn.totalCount, 'issues');
    break;
  }
  after = conn.pageInfo.endCursor;
}
