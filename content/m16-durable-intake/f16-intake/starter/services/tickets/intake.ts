import { Types } from 'mongoose';
import { requireAction, type Context } from '../../packages/contracts/context';
import { Ticket, type TicketRecord } from './model';
export type Intake = { sourceId: string; subject: string; contactId: string };
export async function ingest(ctx: Context, input: Intake): Promise<TicketRecord> {
  throw Error('TODO: durable intake');
}
