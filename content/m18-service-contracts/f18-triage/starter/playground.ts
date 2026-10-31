import { Ticket } from './services/tickets/model';
import { ingest } from './services/tickets/intake';
import { buildContext } from './packages/contracts/context';
import { createTriageRouter } from './services/triage';
await Ticket.init();
const ctx = buildContext({ id: 'ada', memberships: { north: 'agent' } }, 'north', 'r');
const ticket = await ingest(ctx, {
  sourceId: 'triage-demo',
  subject: 'Cannot sign in',
  contactId: 'c1',
});
console.log(
  await createTriageRouter()
    .createCaller(ctx)
    .triage({
      ticketId: String(ticket._id),
      priority: 'high',
      expectedVersion: ticket.version,
    }),
);
