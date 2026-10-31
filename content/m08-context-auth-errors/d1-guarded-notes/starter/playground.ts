import { createServer } from './server';
import { buildContext } from './context';
import { User } from './models/User';

const server = createServer();
await User.create([
  { name: 'Sam', apiKey: 'key-sam' },
  { name: 'Kai', apiKey: 'key-kai' },
]);

// Simulates an HTTP request with an Authorization header.
async function as(authorization: string | undefined, query: string, variables?: Record<string, unknown>) {
  const contextValue = await buildContext({ req: { headers: { authorization } } });
  const res = await server.executeOperation({ query, variables }, { contextValue });
  console.log(`[${authorization ?? 'anonymous'}]`, JSON.stringify(res.body.kind === 'single' ? res.body.singleResult : res.body));
}

await as('ApiKey key-sam', 'mutation { createNote(input: { title: "Groceries", shared: true }) { id title owner { name } } }');
await as('ApiKey key-sam', 'mutation { createNote(input: { title: "" }) { id } }');
await as(undefined, '{ myNotes { title } }');
await as('apikey key-sam', '{ myNotes { title shared createdAt } }');
