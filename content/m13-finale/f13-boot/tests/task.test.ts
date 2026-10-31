import { expect } from 'expect';
import mongoose from 'mongoose';
import { createServer as createNetServer } from 'node:net';
import { httpGraphQL } from '@forge/kit';
import * as indexModule from '../server/index';

const DB = `sandbox_boot_${Date.now().toString(36)}`;
const MONGO = `mongodb://127.0.0.1:27017/${DB}`;
let running: { url: string; stop: () => Promise<void> } | null = null;

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createNetServer();
    srv.listen(0, () => {
      const port = (srv.address() as any).port;
      srv.close(() => resolve(port));
    });
  });
}

async function cleanup() {
  try {
    await running?.stop();
  } catch {
    /* ignore */
  }
  running = null;
  const conn = await mongoose.createConnection(MONGO).asPromise();
  await conn.dropDatabase();
  await conn.close();
}

afterAll(cleanup);

test('nothing starts on import', () => {
  expect(mongoose.connection.readyState).toBe(0);
  expect(typeof (indexModule as any).startServer).toBe('function');
});

test('startServer listens on the port and returns { url, stop }', async () => {
  const port = await freePort();
  running = await (indexModule as any).startServer({ port, mongoUri: MONGO });
  expect(running!.url).toContain(String(port));
  expect(typeof running!.stop).toBe('function');
  expect(mongoose.connection.readyState).toBe(1);
}, { hint: 'mongoose.connect → syncIndexes → startStandaloneServer(createApolloServer(), { listen: { port }, context }).', timeout: 20000 });

test('answers GraphQL over HTTP', async () => {
  const r = await httpGraphQL(running!.url, '{ projects { key } }');
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ data: { projects: [] } });
});

test('unique indexes exist from the first request', async () => {
  const indexes = await mongoose.connection.db!.collection('users').indexes();
  expect(indexes.some((i: any) => i.key?.email === 1 && i.unique)).toBe(true);
}, { hint: 'Run syncIndexes() on the models before serving.' });

test('every model has its indexes before the first request', async () => {
  const db = mongoose.connection.db!;
  const projects = await db.collection('projects').indexes();
  const issues = await db.collection('issues').indexes();
  const comments = await db.collection('comments').indexes();
  expect(projects.some((i: any) => i.key?.key === 1 && i.unique)).toBe(true);
  expect(issues.some((i: any) => i.key?.project === 1 && i.key?.number === 1 && i.unique)).toBe(true);
  expect(comments.some((i: any) => i.key?.issue === 1 && i.key?.createdAt === 1)).toBe(true);
}, { hint: 'Issues and comments need their indexes too, not only users.' });

test('signUp over HTTP, then authenticated requests with the Authorization header', async () => {
  const sign = await httpGraphQL(
    running!.url,
    'mutation($i: SignUpInput!) { signUp(input: $i) { token user { name } } }',
    { i: { name: 'Http Hopper', email: 'http@taskforge.dev', password: 'over-the-wire' } },
  );
  const token = sign.body?.data?.signUp?.token;
  expect(typeof token).toBe('string');
  const anon = await httpGraphQL(running!.url, '{ me { name } }');
  expect(anon.body.data.me).toBeNull();
  const me = await httpGraphQL(running!.url, '{ me { name email } }', undefined, token);
  expect(me.body.data.me).toEqual({ name: 'Http Hopper', email: 'http@taskforge.dev' });
  const created = await httpGraphQL(running!.url, 'mutation { createProject(input: { key: "HTTP", name: "Over HTTP" }) { key owner { name } } }', undefined, token);
  expect(created.body.data.createProject).toEqual({ key: 'HTTP', owner: { name: 'Http Hopper' } });
}, { hint: 'Pass your buildContext as the context function: ({ req }) => buildContext({ req }).' });

test('stop() closes the server and disconnects', async () => {
  const url = running!.url;
  await running!.stop();
  running = null;
  expect(mongoose.connection.readyState).toBe(0);
  let failed = false;
  try {
    await httpGraphQL(url, '{ projects { key } }');
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}, { hint: 'stop: await server.stop(); await mongoose.disconnect();' });
