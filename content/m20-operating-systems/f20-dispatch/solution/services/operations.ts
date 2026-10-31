import { requireAction, type Context } from '../packages/contracts/context';
import { Ticket } from './tickets/model';
import { Activity, openingEvent, type OpeningEvent } from './activity/worker';
export async function dispatchPending(ctx: Context, deliver: (event: OpeningEvent) => Promise<unknown>) {
  requireAction(ctx, 'tickets:triage');
  const tickets = await Ticket.find({
    tenant: ctx.tenant,
    'event.delivered': false,
  })
    .sort({ _id: 1 })
    .lean();
  let delivered = 0,
    failed = 0;
  for (const ticket of tickets) {
    try {
      const event = openingEvent.parse({
        version: 1,
        id: ticket.event.id,
        tenant: ticket.event.tenant,
        ticketId: ticket.event.ticketId,
        type: ticket.event.type,
        requestId: ticket.event.requestId,
      });
      if (event.tenant !== ctx.tenant || event.ticketId !== String(ticket._id)) throw Error('Invalid event identity');
      await deliver(event);
      const result = await Ticket.updateOne(
        { _id: ticket._id, tenant: ctx.tenant, 'event.id': event.id },
        { $set: { 'event.delivered': true } },
      );
      if (result.matchedCount !== 1) throw Error('Acknowledgement lost');
      delivered++;
    } catch {
      failed++;
    }
  }
  return { delivered, failed };
}
export async function operationReport(ctx: Context) {
  requireAction(ctx, 'tickets:read');
  const [tickets, pending, activities] = await Promise.all([
    Ticket.countDocuments({ tenant: ctx.tenant }),
    Ticket.countDocuments({ tenant: ctx.tenant, 'event.delivered': false }),
    Activity.countDocuments({ tenant: ctx.tenant }),
  ]);
  return { tickets, pending, activities };
}
