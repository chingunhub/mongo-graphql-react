import { expect } from 'expect';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { initTRPC, TRPCError } from '@trpc/server';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { z } from 'zod';
import { createSession } from '../web/session';
import { TICKETS } from '../web/operations';
let server: Server, baseUrl: string;
let requests: Array<{ url: string; method: string; headers: any; body: any }>;
let sessions: ReturnType<typeof createSession>[];
let failRest = false,
  failTriage = false;
beforeEach(async () => {
  requests = [];
  sessions = [];
  failRest = false;
  failTriage = false;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    requests.push({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    next();
  });
  app.post('/lab/graphql', (req, res) =>
    res.json({
      data: {
        tickets: [
          {
            __typename: 'Ticket',
            id: 't1',
            tenant: req.headers['x-relay-tenant'],
            subject: 'Inbox ' + req.headers['x-relay-tenant'],
            priority: 'normal',
            version: 3,
            contact: {
              __typename: 'Contact',
              id: 'c1',
              tenant: req.headers['x-relay-tenant'],
              name: 'Contact ' + req.headers['x-relay-tenant'],
            },
          },
        ],
      },
    }),
  );
  app.post('/lab/api/intake', (req, res) =>
    failRest
      ? res.status(403).json({ error: 'FORBIDDEN' })
      : res.json({ id: 't2', subject: req.body.subject, version: 0 }),
  );
  app.get('/lab/api/operations', (_req, res) => res.json({ tickets: 2, pending: 1, activities: 1 }));
  app.post('/lab/api/dispatch', (req, res) =>
    res.json({
      delivered: req.body.simulateFailure ? 0 : 1,
      failed: req.body.simulateFailure ? 1 : 0,
    }),
  );
  const t = initTRPC.create();
  const router = t.router({
    triage: t.procedure
      .input(
        z.object({
          ticketId: z.string(),
          expectedVersion: z.number(),
          priority: z.enum(['low', 'normal', 'high']),
        }),
      )
      .mutation(({ input }) => {
        if (failTriage) throw new TRPCError({ code: 'CONFLICT', message: 'STALE_VERSION' });
        return { ...input, version: input.expectedVersion + 1 };
      }),
  });
  app.use('/lab/trpc', createExpressMiddleware({ router }));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + (server.address() as any).port + '/lab/';
});
afterEach(async () => {
  for (const session of sessions) session.stop();
  if (server)
    await new Promise<void>((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()));
      server.closeIdleConnections();
    });
});
function session(
  tenant = 'north',
  headers = {
    authorization: 'Bearer ' + tenant + '-agent',
    'x-relay-tenant': tenant,
  },
) {
  const s = createSession({ baseUrl, headers });
  sessions.push(s);
  return s;
}
test('GraphQL reads travel through the supplied base path with session identity', async () => {
  const s = session();
  const result = await s.client.query({ query: TICKETS });
  expect((result.data as any).tickets[0].subject).toBe('Inbox north');
  expect(requests[0].url).toBe('/lab/graphql');
  expect(requests[0].headers.authorization).toBe('Bearer north-agent');
});
test('one session caches useful reads; another identity owns another cache', async () => {
  const north = session(),
    south = session('south');
  await north.client.query({ query: TICKETS });
  await north.client.query({ query: TICKETS });
  expect(requests.filter((x) => x.url === '/lab/graphql').length).toBe(1);
  const result = await south.client.query({ query: TICKETS });
  expect((result.data as any).tickets[0].subject).toBe('Inbox south');
  expect(requests.filter((x) => x.url === '/lab/graphql').length).toBe(2);
  expect(north.client).not.toBe(south.client);
  expect(north.client.cache).not.toBe(south.client.cache);
});
test('entity identity includes tenant for both Ticket and Contact', () => {
  const s = session();
  for (const __typename of ['Ticket', 'Contact']) {
    const a = s.client.cache.identify({ __typename, id: '7', tenant: 'north' });
    const b = s.client.cache.identify({ __typename, id: '7', tenant: 'south' });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  }
});
test('REST sends JSON, preserves the credential snapshot, and surfaces non-OK errors', async () => {
  const headers = {
    authorization: 'Bearer north-agent',
    'x-relay-tenant': 'north',
  };
  const s = session('north', headers);
  headers.authorization = 'Bearer south-agent';
  headers['x-relay-tenant'] = 'south';
  const input = {
    sourceId: 'web-1',
    subject: 'Printer broken',
    contactId: 'c1',
  };
  expect(await s.inbox.accept(input)).toEqual({
    id: 't2',
    subject: input.subject,
    version: 0,
  });
  const req = requests[0];
  expect(req.url).toBe('/lab/api/intake');
  expect(req.method).toBe('POST');
  expect(req.body).toEqual(input);
  expect(req.headers['content-type']).toContain('application/json');
  expect(req.headers.authorization).toBe('Bearer north-agent');
  expect(req.headers['x-relay-tenant']).toBe('north');
  failRest = true;
  await expect(s.inbox.accept(input)).rejects.toThrow('FORBIDDEN');
});
test('operations read and dispatch use their declared methods and failure flag', async () => {
  const s = session();
  expect(await s.operations.report()).toEqual({
    tickets: 2,
    pending: 1,
    activities: 1,
  });
  expect(await s.operations.dispatch(true)).toEqual({
    delivered: 0,
    failed: 1,
  });
  expect(requests.map((x) => [x.method, x.url])).toEqual([
    ['GET', '/lab/api/operations'],
    ['POST', '/lab/api/dispatch'],
  ]);
  expect(requests[1].body).toEqual({ simulateFailure: true });
  expect(requests.every((x) => x.headers.authorization === 'Bearer north-agent')).toBe(true);
});
test('real tRPC mutation carries identity, command input and service errors', async () => {
  const s = session();
  const input = {
    ticketId: 't1',
    expectedVersion: 3,
    priority: 'high' as const,
  };
  expect(await s.inbox.triage(input)).toEqual({ ...input, version: 4 });
  expect(requests[0].url).toMatch(/^\/lab\/trpc\/triage/);
  expect(requests[0].headers.authorization).toBe('Bearer north-agent');
  failTriage = true;
  await expect(s.inbox.triage(input)).rejects.toThrow('STALE_VERSION');
});
test('injected fetch handles all transports; disposed sessions reject new operations without traffic', async () => {
  const seen: string[] = [];
  const s = createSession({
    baseUrl,
    headers: { authorization: 'Bearer north-agent', 'x-relay-tenant': 'north' },
    fetcher: async (...args) => {
      seen.push(String(args[0]));
      return fetch(...args);
    },
  });
  sessions.push(s);
  await s.client.query({ query: TICKETS });
  await s.operations.report();
  await s.inbox.triage({
    ticketId: 't1',
    expectedVersion: 1,
    priority: 'high',
  });
  expect(seen.some((x) => x.includes('/graphql'))).toBe(true);
  expect(seen.some((x) => x.includes('/api/operations'))).toBe(true);
  expect(seen.some((x) => x.includes('/trpc/triage'))).toBe(true);
  let stopped = 0;
  const actualStop = s.client.stop.bind(s.client);
  s.client.stop = () => {
    stopped++;
    actualStop();
  };
  s.stop();
  s.stop();
  expect(stopped).toBe(1);
  const before = requests.length;
  await expect(s.inbox.accept({ sourceId: 'x', subject: 'x', contactId: 'c1' })).rejects.toThrow('CLOSED');
  await expect(s.inbox.triage({ ticketId: 'x', expectedVersion: 0, priority: 'high' })).rejects.toThrow(
    'CLOSED',
  );
  await expect(s.operations.report()).rejects.toThrow('CLOSED');
  await expect(s.operations.dispatch(false)).rejects.toThrow('CLOSED');
  expect(requests.length).toBe(before);
});
