import { createApolloServer } from './server/graphql/server';
import { User } from './server/models/User';
import { Project } from './server/models/Project';

const server = createApolloServer();
const ada = await User.create({ name: 'Ada Lovelace', email: 'ada@taskforge.dev' });
await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id] });

// Until module 8 builds it from the request, we hand the context in directly.
const ctx = { currentUser: ada };
async function run(query: string, variables?: Record<string, unknown>) {
  const res = await server.executeOperation({ query, variables }, { contextValue: ctx });
  console.log(JSON.stringify(res.body.kind === 'single' ? res.body.singleResult : res.body, null, 2));
}

await run(`{ projects { id key name owner { name } } }`);

await run(
  `mutation($input: CreateIssueInput!) { createIssue(input: $input) { key title status reporter { name } createdAt } }`,
  { input: { projectId: String((await Project.findOne({ key: 'TF' }))!._id), title: 'Set up CI' } },
);

await run(`{ project(key: "TF") { issues { key title } issueCount stats { total byStatus { status count } } } }`);
