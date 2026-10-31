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
const eventSchema = new Schema<TicketData['event']>(
  {
    id: { type: String, required: true },
    tenant: { type: String, required: true },
    ticketId: { type: String, required: true },
    type: { type: String, required: true },
    requestId: { type: String, required: true },
    delivered: { type: Boolean, default: false },
  },
  { _id: false },
);
const schema = new Schema<TicketData>({
  tenant: { type: String, required: true },
  sourceId: { type: String, required: true },
  subject: { type: String, required: true, trim: true },
  contactId: { type: String, required: true },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high'],
    default: 'normal',
  },
  version: { type: Number, default: 0 },
  event: { type: eventSchema, required: true },
});
schema.index({ tenant: 1, sourceId: 1 }, { unique: true });
export const Ticket =
  (mongoose.models.RelayTicket as mongoose.Model<TicketData>) || mongoose.model<TicketData>('RelayTicket', schema);
export type TicketRecord = TicketData & { _id: Types.ObjectId };
