import { createApolloServer } from './server/graphql/server';
import { buildContext } from './server/graphql/context';
import { User } from './server/models/User';
import { Project } from './server/models/Project';
import { Issue } from './server/models/Issue';

const ada = await User.create({ name: 'Ada Lovelace', email: 'ada@taskforge.dev' });
const tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id] });
for (const title of ['Login page', 'Logout button', 'Dark mode', 'Export to CSV', 'Blog post']) {
  await (Issue as any).createInProject(String(tf._id), { title, reporter: ada._id });
}

const server = createApolloServer();
async function run(query: string, variables?: Record<string, unknown>) {
  const res: any = await server.executeOperation({ query, variables }, { contextValue: await buildContext({ req: { headers: {} } }) });
  console.log(JSON.stringify(res.body.singleResult, null, 2));
  return res.body.singleResult;
}

const page1 = await run(`{ project(key: "TF") { issueConnection(first: 2) { edges { cursor node { key title } } pageInfo { hasNextPage endCursor } totalCount } } }`);
const after = page1.data?.project?.issueConnection?.pageInfo?.endCursor;
await run(`query($after: String) { project(key: "TF") { issueConnection(first: 2, after: $after) { edges { node { key } } pageInfo { hasNextPage } } } }`, { after });

await run(`{ search(term: "lo") { __typename ... on Issue { key title } ... on Project { key } ... on User { name } } }`);
