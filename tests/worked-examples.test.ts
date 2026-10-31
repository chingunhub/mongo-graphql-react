import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT_DIR } from '../server/paths';
import { runJob } from '../server/runner';

async function verifyExample(lesson: string, marker: string, tests: string, db = false) {
  const markdown = await readFile(join(CONTENT_DIR, lesson), 'utf8');
  const code = markdown
    .split('```ts\n')
    .slice(1)
    .map((block) => block.split('```')[0])
    .find((block) => block.startsWith('// @worked-example ' + marker));
  assert.ok(code, 'The tested snippet must be the exact code shown in the lesson');
  const result = await runJob({
    mode: 'test',
    env: 'node',
    db,
    files: { 'example.ts': code },
    tests: { 'task.test.ts': tests },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
}

test('Boundary map worked example lists direct consumers', async () => {
  await verifyExample(
    'm14-system-boundaries/l1-boundaries.md',
    'direct-consumers',
    `
    import { expect } from 'expect';
    import { directConsumers } from '../example';
    test('finds who imports a project', () => {
      expect(directConsumers({ catalogue: ['contracts'], reservations: ['contracts'], contracts: [] }, 'contracts'))
        .toEqual(['catalogue', 'reservations']);
    });
  `,
  );
});

test('Boot order worked example visits dependencies first and exposes the cycle gap', async () => {
  await verifyExample(
    'm14-system-boundaries/l2-monorepos.md',
    'boot-order',
    `
    import { expect } from 'expect';
    import { bootOrder } from '../example';
    test('recipe order', () => {
      expect(bootOrder({ serve: ['cook'], cook: ['chop', 'boil'], chop: [], boil: [] })).toEqual(['chop', 'boil', 'cook', 'serve']);
    });
    test('a shared step appears once', () => {
      expect(bootOrder({ d: ['b', 'c'], b: ['a'], c: ['a'], a: [] })).toEqual(['a', 'b', 'c', 'd']);
    });
    test('the lesson is honest about what a cycle does here', () => {
      expect(bootOrder({ a: ['b'], b: ['a'] })).toEqual(['b', 'a']);
    });
  `,
  );
});

test('Global tenant worked example leaks across an await and context does not', async () => {
  await verifyExample(
    'm15-tenant-boundaries/l1-context.md',
    'global-tenant',
    `
    import { expect } from 'expect';
    import { overlap, isolated } from '../example';
    test('overlapping requests read the last tenant written', async () => {
      await expect(overlap()).resolves.toEqual(['South booking', 'South booking']);
    });
    test('per-request context keeps them apart', async () => {
      await expect(isolated()).resolves.toEqual(['North booking', 'South booking']);
    });
  `,
  );
});

test('Shared cache worked example answers South with North and skips the query', async () => {
  await verifyExample(
    'm15-tenant-boundaries/l2-cache-isolation.md',
    'shared-cache',
    `
    import { expect } from 'expect';
    import { load, reads } from '../example';
    test('the second tenant is answered from the first tenant entry', async () => {
      await expect(load('north', 7)).resolves.toMatchObject({ title: 'North contract' });
      await expect(load('south', 7)).resolves.toMatchObject({ title: 'North contract' });
      expect(reads).toEqual(['north']);
    });
  `,
  );
});

test('Guarded update worked example has one winner', async () => {
  await verifyExample(
    'm16-durable-intake/l1-concurrency.md',
    'guarded-copy',
    `
    import { expect } from 'expect';
    import { resetDb } from '@forge/kit';
    import { Copy, borrow, rush } from '../example';
    beforeEach(resetDb);
    test('eight callers, one loan', async () => {
      const copy = await Copy.create({});
      await expect(rush(String(copy._id))).resolves.toBe(1);
      await expect(borrow(String(copy._id))).resolves.toBe(false);
    });
  `,
    true,
  );
});

test('$setOnInsert worked example keeps the first write', async () => {
  await verifyExample(
    'm16-durable-intake/l2-outbox.md',
    'first-visit',
    `
    import { expect } from 'expect';
    import { resetDb } from '@forge/kit';
    import { Visit, recordVisit } from '../example';
    beforeAll(() => Visit.init());
    beforeEach(resetDb);
    test('first write wins per branch', async () => {
      await expect(recordVisit('north', 'c1', 'desk-a')).resolves.toMatchObject({ firstDesk: 'desk-a' });
      await expect(recordVisit('north', 'c1', 'desk-b')).resolves.toMatchObject({ firstDesk: 'desk-a' });
      await expect(recordVisit('south', 'c1', 'desk-b')).resolves.toMatchObject({ firstDesk: 'desk-b' });
      await expect(Visit.countDocuments()).resolves.toBe(2);
    });
  `,
    true,
  );
});

test('Composition worked example reports a real type conflict', async () => {
  await verifyExample(
    'm17-federation/l2-composition.md',
    'composition-conflict',
    `
    import { expect } from 'expect';
    import { compose } from '../example';
    test('agreeing subgraphs compose', () => {
      expect(compose('Int!')).toEqual([]);
    });
    test('disagreeing subgraphs do not', () => {
      expect(compose('String!')).toEqual(['FIELD_TYPE_MISMATCH']);
    });
  `,
  );
});

test('Federation worked example enforces the library at both entry points', async () => {
  await verifyExample(
    'm17-federation/l1-entities.md',
    'federation-book',
    `
    import { expect } from 'expect';
    import { graphql } from 'graphql';
    import { bookSchema } from '../example';
    test('ordinary query', async () => {
      const result = await graphql({schema:bookSchema, source:'{ book(isbn:"42") { title } }', contextValue:{library:'north'}});
      expect(result.errors).toBeUndefined();
      expect(result.data.book.title).toBe('The Dispossessed');
    });
    test('reference lookup preserves slots and rejects foreign identities', async () => {
      const result = await graphql({schema:bookSchema,
        source:'query($refs:[_Any!]!) { _entities(representations:$refs) { ... on Book { title } } }',
        variableValues:{refs:[{__typename:'Book',library:'north',isbn:'42'},{__typename:'Book',library:'south',isbn:'42'},{__typename:'Book',library:'north',isbn:'missing'}]},
        contextValue:{library:'north'}});
      expect(result.errors).toBeUndefined();
      expect(JSON.parse(JSON.stringify(result.data._entities))).toEqual([{title:'The Dispossessed'},null,null]);
    });
  `,
  );
});

test('Zod worked example reports exactly the fields the lesson lists', async () => {
  await verifyExample(
    'm18-service-contracts/l1-runtime-contracts.md',
    'renewal-parser',
    `
    import { expect } from 'expect';
    import { check } from '../example';
    test('parser outcomes', () => {
      expect(check({ cardId: 'abcd1234', weeks: 2 })).toEqual({ cardId: 'abcd1234', weeks: 2 });
      expect(check({ cardId: 'abcd1234', weeks: '2' })).toEqual(['weeks']);
      expect(check({ cardId: 'abcd1234', weeks: 2.5 })).toEqual(['weeks']);
      expect(check({ cardId: 'abcd1234', weeks: 2, admin: true })).toEqual(['']);
    });
  `,
  );
});

test('tRPC client worked example talks to a real HTTP server', async () => {
  await verifyExample(
    'm18-service-contracts/l1-runtime-contracts.md',
    'fee-client',
    `
    import { expect } from 'expect';
    import { initTRPC } from '@trpc/server';
    import { createHTTPServer } from '@trpc/server/adapters/standalone';
    import { z } from 'zod';
    import { connect } from '../example';
    const t = initTRPC.create();
    const router = t.router({
      estimate: t.procedure.input(z.object({ daysLate: z.number().int() }).strict())
        .query(({ input }) => ({ cents: input.daysLate * 25 })),
    });
    test('query travels over HTTP, and bad input is refused by the server', async () => {
      const server = createHTTPServer({ router }).listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
      try {
        const client = connect('http://127.0.0.1:' + server.address().port) as any;
        await expect(client.estimate.query({ daysLate: 2 })).resolves.toEqual({ cents: 50 });
        await expect(client.estimate.query({ daysLate: 'two' })).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  `,
  );
});

test('Narrow translation worked example changes only the known failure', async () => {
  await verifyExample(
    'm18-service-contracts/l2-service-failures.md',
    'narrow-translation',
    `
    import { expect } from 'expect';
    import { StaleVersion, withDomainErrors } from '../example';
    test('a stale version becomes CONFLICT', async () => {
      await expect(withDomainErrors(async () => { throw new StaleVersion(); })).rejects.toMatchObject({ code: 'CONFLICT' });
    });
    test('anything else escapes unchanged', async () => {
      const outage = new Error('mongo down');
      await expect(withDomainErrors(async () => { throw outage; })).rejects.toBe(outage);
      await expect(withDomainErrors(async () => 7)).resolves.toBe(7);
    });
  `,
  );
});

test('Receipt worked example records one return under a concurrent race', async () => {
  await verifyExample(
    'm19-background-work/l2-idempotency.md',
    'return-receipt',
    `
    import { expect } from 'expect';
    import { resetDb } from '@forge/kit';
    import { Receipt, delivered, recordReturn } from '../example';
    beforeAll(() => Receipt.init());
    beforeEach(resetDb);
    test('one recorded, four already recorded, one row', async () => {
      const outcomes = await delivered();
      expect(outcomes.filter((o) => o === 'recorded')).toHaveLength(1);
      expect(outcomes.filter((o) => o === 'already-recorded')).toHaveLength(4);
      await expect(Receipt.countDocuments()).resolves.toBe(1);
    });
    test('a validation failure is not a duplicate', async () => {
      await expect(recordReturn('', 'e-2')).rejects.toThrow();
    });
  `,
    true,
  );
});

test('Timed worked example records both outcomes and preserves the failure', async () => {
  await verifyExample(
    'm20-operating-systems/l1-observability.md',
    'timed-step',
    `
    import { expect } from 'expect';
    import { timed } from '../example';
    const fields = { requestId: 'r1', tenant: 'north', operation: 'ingest', token: 'secret' } as any;
    test('success is logged with exactly the allowed fields', async () => {
      const entries: any[] = [];
      await expect(timed((e) => entries.push(e), fields, async () => 5)).resolves.toBe(5);
      expect(Object.keys(entries[0]).sort()).toEqual(['durationMs', 'operation', 'outcome', 'requestId', 'tenant']);
      expect(entries[0].outcome).toBe('ok');
    });
    test('failure is logged and still rejects', async () => {
      const entries: any[] = [];
      const boom = new Error('boom');
      await expect(timed((e) => entries.push(e), fields, async () => { throw boom; })).rejects.toBe(boom);
      expect(entries[0].outcome).toBe('error');
    });
  `,
  );
});

test('Slip worked example recovers by running the same function again', async () => {
  await verifyExample(
    'm20-operating-systems/l2-recovery.md',
    'slip-run',
    `
    import { expect } from 'expect';
    import { sendAll } from '../example';
    test('the lesson numbers', async () => {
      const slips = [{ id: 'a', sent: false }, { id: 'b', sent: false }, { id: 'c', sent: false }];
      let down = true;
      const send = async (slip: { id: string }) => { if (slip.id === 'b' && down) throw new Error('down'); };
      await expect(sendAll(slips, send)).resolves.toEqual({ sent: 2, failed: 1 });
      down = false;
      await expect(sendAll(slips, send)).resolves.toEqual({ sent: 1, failed: 0 });
    });
  `,
  );
});

test('One-plugin worked example turns a rejection into a value', async () => {
  await verifyExample(
    'm21-plugin-delivery/l1-plugin-ui.md',
    'load-one',
    `
    import { expect } from 'expect';
    import { loadOne } from '../example';
    test('both outcomes', async () => {
      await expect(loadOne('a', async () => ({ title: 'A' }))).resolves.toEqual({ name: 'a', status: 'ready', module: { title: 'A' } });
      await expect(loadOne('b', async () => { throw new Error('offline'); })).resolves.toEqual({ name: 'b', status: 'failed' });
    });
  `,
  );
});

test('Close-once worked example shares one cleanup, even a failed one', async () => {
  await verifyExample(
    'm21-plugin-delivery/l2-release.md',
    'close-once',
    `
    import { expect } from 'expect';
    import { closeOnce } from '../example';
    test('concurrent callers share the promise', async () => {
      let calls = 0;
      const close = closeOnce(async () => { calls += 1; });
      expect(close()).toBe(close());
      await close();
      expect(calls).toBe(1);
    });
    test('a rejected cleanup is not repeated', async () => {
      let calls = 0;
      const close = closeOnce(async () => { calls += 1; throw new Error('stuck'); });
      await expect(close()).rejects.toThrow('stuck');
      await expect(close()).rejects.toThrow('stuck');
      expect(calls).toBe(1);
    });
  `,
  );
});

test('Library-card worked example follows the lesson table', async () => {
  await verifyExample(
    'm22-system-ownership/l1-http-boundaries.md',
    'library-card',
    `
    import { expect } from 'expect';
    import { memberFrom } from '../example';
    test('table rows', () => {
      expect(memberFrom({ 'x-library-card': 'card-ana' })?.id).toBe('ana');
      expect(memberFrom({})).toBeNull();
      expect(memberFrom({ 'x-library-card': ['card-ana', 'card-bob'] })).toBeNull();
      expect(memberFrom({ 'x-library-card': 'toString' })).toBeNull();
    });
  `,
  );
});

test('Close-all worked example attempts everything in reverse and reports all failures', async () => {
  await verifyExample(
    'm22-system-ownership/l2-queue-lifecycle.md',
    'close-all',
    `
    import { expect } from 'expect';
    import { closeAll } from '../example';
    test('reverse order, nothing skipped, input unchanged', async () => {
      const order: string[] = [];
      const step = (name: string, fails = false) => async () => {
        order.push(name);
        if (fails) throw new Error(name);
      };
      const closers = [step('a'), step('b', true), step('c')];
      const failure = await closeAll(closers).catch((error) => error);
      expect(order).toEqual(['c', 'b', 'a']);
      expect(failure).toBeInstanceOf(AggregateError);
      expect(failure.errors.map((e: Error) => e.message)).toEqual(['b']);
      expect(closers).toHaveLength(3);
      await expect(closeAll([async () => {}])).resolves.toBeUndefined();
    });
  `,
  );
});

test('Reused client worked example serves North to South with no request', async () => {
  await verifyExample(
    'm23-client-ownership/l1-client-boundaries.md',
    'reused-client',
    `
    import { expect } from 'expect';
    import { switchTenant } from '../example';
    test('the second read never reaches the link', async () => {
      await expect(switchTenant()).resolves.toEqual({ requests: 1, title: 'North atlas' });
    });
  `,
  );
});

test('Base path worked example keeps or loses the prefix as the lesson says', async () => {
  await verifyExample(
    'm23-client-ownership/l1-client-boundaries.md',
    'base-path',
    `
    import { expect } from 'expect';
    import { relative, rooted } from '../example';
    test('comments match', () => {
      expect(relative).toBe('http://127.0.0.1:4500/projects/relaydesk/reference/graphql');
      expect(rooted).toBe('http://127.0.0.1:4500/graphql');
    });
  `,
  );
});

test('Lifetime worked example answers for the latest operation only', async () => {
  await verifyExample(
    'm23-client-ownership/l2-view-states.md',
    'latest-only',
    `
    import { expect } from 'expect';
    import { lifetime } from '../example';
    test('only the newest stays current', () => {
      const life = lifetime();
      const first = life.begin();
      expect(first()).toBe(true);
      const second = life.begin();
      expect(first()).toBe(false);
      expect(second()).toBe(true);
      life.end();
      expect(second()).toBe(false);
    });
  `,
  );
});

test('Load-class worked example closes over one connection per tenant', async () => {
  await verifyExample(
    'm24-erxes-field-guide/l1-plugin-anatomy.md',
    'load-class',
    `
    import { expect } from 'expect';
    import mongoose from 'mongoose';
    import { loadClasses } from '../example';
    const north = mongoose.connection.useDb(mongoose.connection.name + '_north_notes');
    const south = mongoose.connection.useDb(mongoose.connection.name + '_south_notes');
    afterAll(async () => {
      await north.dropDatabase();
      await south.dropDatabase();
    });
    test('each set of models sees its own database', async () => {
      const northModels = loadClasses(north);
      const southModels = loadClasses(south);
      const note = await northModels.Notes.create({ text: 'Private' });
      const found = await northModels.Notes.getNote(String(note._id));
      expect(found.text).toBe('Private');
      await expect(southModels.Notes.getNote(String(note._id))).rejects.toThrow('Note not found');
    });
  `,
    true,
  );
});

test('Default-value worked example follows the lesson table', async () => {
  await verifyExample(
    'm24-erxes-field-guide/l2-guards-and-messages.md',
    'default-value',
    `
    import { expect } from 'expect';
    import { ask, sendMessage } from '../example';
    const fail = async (): Promise<number> => { throw new Error('offline'); };
    test('every row of the table', async () => {
      expect(await sendMessage(async () => 12, 5)).toBe(12);
      expect(await sendMessage(async () => 0, 5)).toBe(5);
      expect(await sendMessage(async () => false as unknown as number, 5)).toBe(5);
      expect(await sendMessage(fail, 5)).toBe(5);
    });
    test('ask keeps a real zero apart from a failure', async () => {
      expect(await ask(async () => 0)).toEqual({ ok: true, value: 0 });
      expect(await ask(fail)).toEqual({ ok: false, reason: 'offline' });
    });
  `,
  );
});

test('Simple channel worked example delivers, and leaks across tenants as the lesson says', async () => {
  await verifyExample(
    'm24-erxes-field-guide/l3-subscriptions.md',
    'simple-channel',
    `
    import { expect } from 'expect';
    import { PubSub } from 'graphql-subscriptions';
    import { generateResolvers, publishOrderChanged } from '../example';
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    test('a listener on the id hears whoever publishes that id', async () => {
      const pubsub = new PubSub();
      const stream = generateResolvers(pubsub).orderChanged.subscribe(undefined, { _id: 'o1' });
      const next = stream.next();
      await tick();
      await publishOrderChanged(pubsub, { _id: 'o2', status: 'other' });
      await publishOrderChanged(pubsub, { _id: 'o1', status: 'shipped' });
      expect((await next).value).toEqual({ orderChanged: { _id: 'o1', status: 'shipped' } });
      await stream.return?.();
    });
  `,
  );
});

test('Filtered channel worked example trusts the context, not the variables', async () => {
  await verifyExample(
    'm24-erxes-field-guide/l3-subscriptions.md',
    'filtered-channel',
    `
    import { expect } from 'expect';
    import { PubSub } from 'graphql-subscriptions';
    import { generateResolvers } from '../example';
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    const sale = (subdomain: string, region: string, total: number) => ({ saleAdded: { subdomain, region, total } });
    test('other tenants and other regions are skipped', async () => {
      const pubsub = new PubSub();
      const subscribe = generateResolvers(pubsub).saleAdded.subscribe;
      const stream = await subscribe(undefined, { region: 'east' }, { subdomain: 'north' }, undefined as any);
      const next = stream.next();
      await tick();
      await pubsub.publish('saleAdded', sale('south', 'east', 1));
      await pubsub.publish('saleAdded', sale('north', 'west', 2));
      await pubsub.publish('saleAdded', sale('north', 'east', 3));
      expect((await next).value).toEqual(sale('north', 'east', 3));
      await stream.return?.();
    });
  `,
  );
});

test('Derived atom worked example cannot drift from its source', async () => {
  await verifyExample(
    'm24-erxes-field-guide/l4-frontend-stack.md',
    'derived-atom',
    `
    import { expect } from 'expect';
    import { makeStore, selectedCountState, selectedIdsState, toggleIdState } from '../example';
    test('the count follows the ids', () => {
      const store = makeStore();
      expect(store.get(selectedCountState)).toBe(0);
      store.set(toggleIdState, 'a');
      store.set(toggleIdState, 'b');
      expect(store.get(selectedCountState)).toBe(2);
      store.set(toggleIdState, 'a');
      expect(store.get(selectedIdsState)).toEqual(['b']);
      expect(store.get(selectedCountState)).toBe(1);
    });
    test('each store is separate', () => {
      const one = makeStore();
      one.set(toggleIdState, 'a');
      expect(makeStore().get(selectedCountState)).toBe(0);
    });
  `,
  );
});

test('Caller worked example plays every kind of caller without a server', async () => {
  await verifyExample(
    'm18-service-contracts/l2-service-failures.md',
    'room-caller',
    `
    import { expect } from 'expect';
    import { staff, stranger } from '../example';
    test('the three outcomes the lesson lists', async () => {
      await expect(staff.resize({ room: 'r4', capacity: 8 })).resolves.toEqual({ room: 'r4', capacity: 8 });
      await expect(staff.resize({ room: 'r4', capacity: 0 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(stranger.resize({ room: 'r4', capacity: 8 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  `,
  );
});

test('Parcel reference worked example reuses, generates or rejects', async () => {
  await verifyExample(
    'm22-system-ownership/l1-http-boundaries.md',
    'parcel-ref',
    `
    import { expect } from 'expect';
    import { parcelRef } from '../example';
    test('absent generates, valid is reused', () => {
      expect(parcelRef(undefined)).toMatch(/^[0-9a-f-]{36}$/);
      expect(parcelRef('abc-1')).toBe('abc-1');
    });
    test('everything the lesson says is rejected', () => {
      for (const bad of ['abc\\n', '', ['abc'], 'x'.repeat(65), 'a b'])
        expect(() => parcelRef(bad as any)).toThrow('BAD_REQUEST');
    });
  `,
  );
});

test('Counter worked example counts a repeated event once, even in a race', async () => {
  await verifyExample(
    'm19-background-work/l2-idempotency.md',
    'counted-once',
    `
    import { expect } from 'expect';
    import { resetDb } from '@forge/kit';
    import { Shelf, countReturn } from '../example';
    beforeEach(resetDb);
    test('five simultaneous deliveries count once', async () => {
      await Shelf.create({ _id: 's1' });
      const results = await Promise.all(Array.from({ length: 5 }, () => countReturn('s1', 'e-1')));
      expect(results.filter((r) => r === 'counted')).toHaveLength(1);
      await countReturn('s1', 'e-2');
      expect((await Shelf.findById('s1').lean())).toMatchObject({ returnedCount: 2, seenEvents: ['e-1', 'e-2'] });
    });
  `,
    true,
  );
});

test('tRPC worked example separates parsing from authentication', async () => {
  await verifyExample(
    'm18-service-contracts/l1-runtime-contracts.md',
    'library-fee',
    `
    import { expect } from 'expect';
    import { lateFeeRouter } from '../example';
    test('valid integer computes the promised amount', async () => {
      await expect(lateFeeRouter.createCaller({memberId:'m1'}).estimate({daysLate:2})).resolves.toEqual({cents:50});
    });
    test('runtime rejects invalid or extra data', async () => {
      const caller=lateFeeRouter.createCaller({memberId:'m1'});
      for(const input of [{daysLate:'2'},{daysLate:2.5},{daysLate:-1},{daysLate:366},{daysLate:2,memberId:'forged'}])
        await expect(caller.estimate(input as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
    });
    test('valid input does not grant authentication', async () => {
      await expect(lateFeeRouter.createCaller({memberId:null}).estimate({daysLate:2})).rejects.toMatchObject({code:'UNAUTHORIZED'});
    });
  `,
  );
});
