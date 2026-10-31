import { createApolloServer } from './server/graphql/server';
import { buildContext } from './server/graphql/context';
import { signToken } from './server/auth/tokens';
import { User } from './server/models/User';
import { Project } from './server/models/Project';
import { Issue } from './server/models/Issue';

// Try the API with no UI in the way. Change this freely.
const server = createApolloServer();
const ada = await User.create({ name: 'Ada', email: 'ada@taskforge.dev', password: 'ada-password' });
const tf = await Project.create({ name: 'Taskforge', key: 'TF', owner: ada._id, members: [ada._id] });
const issues: any[] = [];
for (let i = 1; i <= 4; i++) issues.push(await (Issue as any).createInProject(String(tf._id), { title: 'Issue ' + i, reporter: ada._id }));

const ask = async (query: string, variables?: Record<string, unknown>) => {
  const req = { headers: { authorization: `Bearer ${signToken(String(ada._id))}` } };
  const res: any = await server.executeOperation({ query, variables }, { contextValue: await buildContext({ req } as any) });
  return JSON.stringify(res.body.singleResult);
};

const PIN = 'mutation Pin($id: ID!) { setIssuePinned(id: $id, pinned: true) { key pinned } }';
for (const issue of issues) console.log(await ask(PIN, { id: String(issue._id) }));
console.log(await ask('{ project(key: "TF") { pinnedIssues { key } } }'));
