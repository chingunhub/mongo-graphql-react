import { createApolloServer } from './server/graphql/server';
import { buildContext } from './server/graphql/context';
import { User } from './server/models/User';
import { Project } from './server/models/Project';

const server = createApolloServer();
const grace = await User.create({ name: 'Grace', email: 'grace@taskforge.dev', password: 'grace-password' });
await Project.create({ name: 'Taskforge', key: 'TF', owner: grace._id, members: [grace._id] });

// Simulates HTTP: builds the context from headers, exactly like the real server will.
async function request(query: string, variables?: Record<string, unknown>, token?: string) {
  const contextValue = await buildContext({ req: { headers: token ? { authorization: `Bearer ${token}` } : {} } });
  const res = await server.executeOperation({ query, variables }, { contextValue });
  const body = res.body.kind === 'single' ? res.body.singleResult : res.body;
  console.log(JSON.stringify(body));
  return body as any;
}

const signUp = await request(
  'mutation($input: SignUpInput!) { signUp(input: $input) { token user { name email } } }',
  { input: { name: 'Ada', email: 'ada@taskforge.dev', password: 'correct horse' } },
);
const token = signUp.data?.signUp?.token;

await request('{ me { name email } }', {}, token);
await request('{ project(key: "TF") { owner { name email } } }', {}, token); // email: null — not you
await request('mutation { createProject(input: { key: "ADA", name: "Ada’s" }) { key } }'); // no token
