import { Ticket } from './services/tickets/model';
import { ingest } from './services/tickets/intake';
import { buildContext } from './packages/contracts/context';
await Ticket.init();
const ctx = buildContext({ id: 'ada', memberships: { north: 'agent' } }, 'north', 'r-demo');
console.log(
  await Promise.all([
    ingest(ctx, { sourceId: 'mail-7', subject: ' Help ', contactId: 'c1' }),
    ingest(ctx, { sourceId: 'mail-7', subject: 'retry', contactId: 'c1' }),
  ]),
);
