import { createServer } from './server';

const server = createServer();

async function run(query: string, variables?: Record<string, unknown>) {
  const res = await server.executeOperation({ query, variables });
  console.log(JSON.stringify(res.body.kind === 'single' ? res.body.singleResult : res.body, null, 2));
}

await run(`{ books(genre: SCIFI) { title year author { name } } }`);
await run(`{ authors { name books { title } } }`);
await run(
  `mutation Add($input: AddBookInput!) { addBook(input: $input) { id title author { name } } }`,
  { input: { title: 'The Lathe of Heaven', year: 1971, genre: 'SCIFI', authorId: 'au1' } },
);
await run(`{ book(id: "nope") { title } }`);
