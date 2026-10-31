import { Schema, type HydratedDocument } from 'mongoose';

export interface ITicket {
  subject: string;
  status: 'open' | 'closed';
}
export type ITicketDocument = HydratedDocument<ITicket>;

export const ticketSchema = new Schema<ITicket>({
  subject: { type: String, required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
});
