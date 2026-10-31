import { expect } from 'expect';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { TriageRouter } from '../services/triage';
import { boot } from '../services/lifecycle';
import { startRelaydesk } from '../runtime/start';
import { Contact } from '../services/contacts/model';
test('startup order and idempotent stop', async () => {
  const calls: string[] = [];
  const app = await boot({
    connect: async () => {
      calls.push('connect');
    },
    ensureIndexes: async () => {
      calls.push('indexes');
    },
    serve: async () => {
      calls.push('serve');
      return {
        url: 'local',
        stop: async () => {
          calls.push('stop');
        },
      };
    },
    disconnect: async () => {
      calls.push('disconnect');
    },
  });
  expect(app.url).toBe('local');
  await Promise.all([app.stop(), app.stop()]);
  expect(calls).toEqual(['connect', 'indexes', 'serve', 'stop', 'disconnect']);
});
test('every startup failure attempts cleanup and preserves original cause', async () => {
  for (const stage of ['connect', 'indexes', 'serve']) {
    let disconnect = 0;
    const fail = async (name: string) => {
      if (stage === name) throw Error(stage + ' failed');
    };
    await expect(
      boot({
        connect: () => fail('connect'),
        ensureIndexes: () => fail('indexes'),
        serve: async () => {
          await fail('serve');
          return { url: 'x', stop: async () => {} };
        },
        disconnect: async () => {
          disconnect++;
          throw Error('cleanup failed');
        },
      }),
    ).rejects.toThrow(stage + ' failed');
    expect(disconnect).toBe(1);
  }
});
test('failed server stop still closes storage once', async () => {
  let calls = 0;
  const app = await boot({
    connect: async () => {},
    ensureIndexes: async () => {},
    serve: async () => ({
      url: 'x',
      stop: async () => {
        throw Error('stop failed');
      },
    }),
    disconnect: async () => {
      calls++;
    },
  });
  await expect(app.stop()).rejects.toThrow('stop failed');
  await expect(app.stop()).rejects.toThrow('stop failed');
  expect(calls).toBe(1);
});
test(
  'complete system crosses HTTP, Federation, tRPC and recovery boundaries',
  async () => {
    const name = 'forge_relay_verify_' + randomUUID().replaceAll('-', '');
    const mongoUri = 'mongodb://127.0.0.1:27017/' + name;
    let app: Awaited<ReturnType<typeof startRelaydesk>> | undefined;
    const headers = (tenant = 'north', role = 'agent') => ({
      authorization: 'Bearer ' + tenant + '-' + role,
      'x-relay-tenant': tenant,
      'content-type': 'application/json',
    });
    try {
      app = await startRelaydesk({ mongoUri, port: 0 });
      const url = app.url;
      const request = async (path: string, body?: unknown, tenant = 'north', role = 'agent') => {
        const res = await fetch(url + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: headers(tenant, role),
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, data: await res.json() };
      };
      expect((await request('health')).data.ready).toBe(true);
      expect((await fetch(url + 'api/operations')).status).toBe(401);
      await Contact.create([
        { tenant: 'north', id: 'c1', name: 'North Contact' },
        { tenant: 'south', id: 'c1', name: 'South Contact' },
      ]);
      const input = {
        sourceId: 'same-source',
        subject: 'Help',
        contactId: 'c1',
      };
      const first = await request('api/intake', input);
      expect(first.status).toBe(200);
      expect((await request('api/intake', input)).data.id).toBe(first.data.id);
      const south = await request('api/intake', input, 'south');
      expect(south.data.id).not.toBe(first.data.id);
      expect((await request('api/intake', { ...input, sourceId: 'reader' }, 'north', 'reader')).status).toBe(
        403,
      );
      const graph = await request('graphql', {
        query: '{ tickets { id contact { name } } }',
      });
      expect(graph.data.errors).toBeUndefined();
      expect(graph.data.data.tickets).toEqual([{ id: first.data.id, contact: { name: 'North Contact' } }]);
      const trpc = createTRPCClient<TriageRouter>({
        links: [httpBatchLink({ url: url + 'trpc', headers: headers() })],
      });
      expect(
        await trpc.triage.mutate({
          ticketId: first.data.id,
          priority: 'high',
          expectedVersion: 0,
        }),
      ).toMatchObject({ priority: 'high', version: 1 });
      await expect(
        trpc.triage.mutate({
          ticketId: first.data.id,
          priority: 'low',
          expectedVersion: 0,
        }),
      ).rejects.toThrow();
      expect((await request('api/dispatch', { simulateFailure: true })).data).toEqual({
        delivered: 0,
        failed: 1,
      });
      expect((await request('api/operations')).data).toEqual({
        tickets: 1,
        pending: 1,
        activities: 0,
      });
      expect((await request('api/dispatch', {})).data).toEqual({
        delivered: 1,
        failed: 0,
      });
      expect((await request('api/operations')).data).toEqual({
        tickets: 1,
        pending: 0,
        activities: 1,
      });
      expect((await request('api/operations', undefined, 'south')).data).toEqual({
        tickets: 1,
        pending: 1,
        activities: 0,
      });
      const forged = await fetch(url + 'api/operations', {
        headers: { ...headers(), 'x-relay-tenant': 'south' },
      });
      expect(forged.status).toBe(403);
      await app.stop();
      app = undefined;
      await expect(fetch(url + 'health')).rejects.toThrow();
    } finally {
      await app?.stop().catch(() => {});
      await mongoose.disconnect();
      const cleanup = await mongoose.createConnection(mongoUri).asPromise();
      await cleanup.dropDatabase();
      await cleanup.close();
    }
  },
  { timeout: 20000 },
);
