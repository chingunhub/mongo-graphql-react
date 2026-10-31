import mongoose, { Schema, Types } from 'mongoose';
export interface TicketData {
  tenant: string;
  sourceId: string;
  subject: string;
  contactId: string;
  priority: 'low' | 'normal' | 'high';
  version: number;
  event: {
    id: string;
    tenant: string;
    ticketId: string;
    type: string;
    requestId: string;
    delivered: boolean;
  };
}
// TODO: replace this incomplete Mongoose Schema and add the compound index.
const schema = new Schema<TicketData>({
  tenant: String,
  sourceId: String,
  subject: String,
  contactId: String,
});
export const Ticket =
  (mongoose.models.RelayTicket as mongoose.Model<TicketData>) || mongoose.model<TicketData>('RelayTicket', schema);
export type TicketRecord = TicketData & { _id: Types.ObjectId };
