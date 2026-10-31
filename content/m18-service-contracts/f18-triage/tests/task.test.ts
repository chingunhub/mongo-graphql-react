import { expect } from 'expect';
import { resetDb } from '@forge/kit';
import { Ticket } from '../services/tickets/model';
import { ingest } from '../services/tickets/intake';
import { buildContext } from '../packages/contracts/context';
import { createTriageRouter } from '../services/triage';
const ctx = (tenant = 'n', role = 'agent') =>
  buildContext({ id: 'a', memberships: { [tenant]: role } as any }, tenant, 'r');
const caller = (tenant = 'n', role = 'agent') => createTriageRouter().createCaller(ctx(tenant, role));
const seed = () => ingest(ctx(), { sourceId: '1', subject: 'Help', contactId: 'c1' });
beforeAll(() => Ticket.init());
beforeEach(resetDb);
test('valid mutation updates the selected version', async () => {
  const ticket = await seed();
  expect(
    await caller().triage({
      ticketId: String(ticket._id),
      priority: 'high',
      expectedVersion: 0,
    }),
  ).toEqual({ id: String(ticket._id), priority: 'high', version: 1 });
});
test('stale version rejects without overwriting', async () => {
  const ticket = await seed();
  const input = {
    ticketId: String(ticket._id),
    priority: 'high' as const,
    expectedVersion: 0,
  };
  await caller().triage(input);
  await expect(caller().triage({ ...input, priority: 'low' })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await Ticket.findById(ticket._id))?.priority).toBe('high');
});
test('foreign tenant cannot update a guessed ticket ID', async () => {
  const ticket = await seed();
  await expect(
    caller('s').triage({
      ticketId: String(ticket._id),
      priority: 'high',
      expectedVersion: 0,
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await Ticket.findById(ticket._id))?.version).toBe(0);
});
test('reader cannot triage', async () => {
  const ticket = await seed();
  await expect(
    caller('n', 'reader').triage({
      ticketId: String(ticket._id),
      priority: 'high',
      expectedVersion: 0,
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const row = await Ticket.findById(ticket._id);
  expect(row?.priority).toBe('normal');
  expect(row?.version).toBe(0);
});
test('runtime parser rejects hostile or stale-shaped inputs', async () => {
  const ticket = await seed();
  const base = {
    ticketId: String(ticket._id),
    priority: 'normal',
    expectedVersion: 0,
  };
  for (const patch of [
    { tenant: 's' },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { ticketId: 'bad' },
    { priority: 'urgent' },
  ])
    await expect(caller().triage({ ...base, ...patch } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
test('simultaneous edits cannot both succeed', async () => {
  const ticket = await seed();
  const input = {
    ticketId: String(ticket._id),
    priority: 'high' as const,
    expectedVersion: 0,
  };
  const results = await Promise.allSettled([caller().triage(input), caller().triage(input)]);
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect((await Ticket.findById(ticket._id))?.version).toBe(1);
});
