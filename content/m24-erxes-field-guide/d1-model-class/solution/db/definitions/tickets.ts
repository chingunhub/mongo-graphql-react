import { Schema, type HydratedDocument } from 'mongoose';

export interface ITicket {
  sourceId: string;
  subject: string;
  status: 'open' | 'closed';
}
export type ITicketDocument = HydratedDocument<ITicket>;

export const ticketSchema = new Schema<ITicket>({
  sourceId: { type: String, required: true, unique: true },
  subject: { type: String, required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
});
