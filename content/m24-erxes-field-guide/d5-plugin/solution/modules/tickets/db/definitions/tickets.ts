import { Schema, type HydratedDocument } from 'mongoose';

export interface ITicket {
  subject: string;
  priority: 'normal' | 'high';
  contactId?: string;
}
export type ITicketDocument = HydratedDocument<ITicket>;

export const ticketSchema = new Schema<ITicket>({
  subject: { type: String, required: true },
  priority: { type: String, enum: ['normal', 'high'], default: 'normal' },
  contactId: { type: String },
});
