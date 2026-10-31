import { Types } from 'mongoose';
import { requireAction, type Context } from '../../packages/contracts/context';
import { Ticket, type TicketRecord } from './model';
export type Intake = { sourceId: string; subject: string; contactId: string };
export async function ingest(ctx: Context, input: Intake): Promise<TicketRecord> {
  requireAction(ctx, 'tickets:triage');
  if (![input.sourceId, input.subject, input.contactId].every((v) => typeof v === 'string' && v.trim()))
    throw Error('BAD_INPUT');
  const filter = { tenant: ctx.tenant, sourceId: input.sourceId };
  const id = new Types.ObjectId();
  const document = {
    _id: id,
    ...filter,
    subject: input.subject.trim(),
    contactId: input.contactId,
    priority: 'normal',
    version: 0,
    event: {
      id: String(id),
      tenant: ctx.tenant,
      ticketId: String(id),
      type: 'ticket.opened',
      requestId: ctx.requestId,
      delivered: false,
    },
  };
  try {
    return (await Ticket.findOneAndUpdate(
      filter,
      { $setOnInsert: document },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean())!;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const existing = await Ticket.findOne(filter).lean();
    if (!existing) throw error;
    return existing;
  }
}
