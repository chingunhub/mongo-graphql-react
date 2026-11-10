import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IReply {
  body: string;
  /** Who wrote it: an agent's user ID, or a portal owner key such as "cp:c-17". */
  authorId: string;
  createdAt: Date;
}

export interface ITicket {
  subject: string;
  description?: string;
  status: 'open' | 'answered' | 'closed';
  /** Who created it. Portal creators are stored as "cp:<id>", agents as their plain user ID. */
  userId: string;
  /** The portal it was filed through. */
  clientPortalId?: string;
  replies: IReply[];
  createdAt: Date;
  updatedAt: Date;
}
export type ITicketDocument = HydratedDocument<ITicket>;

const replySchema = new Schema<IReply>(
  {
    body: { type: String, required: true },
    authorId: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const ticketSchema = new Schema<ITicket>(
  {
    subject: { type: String, required: true },
    description: String,
    status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open' },
    userId: { type: String, required: true, index: true },
    clientPortalId: String,
    replies: { type: [replySchema], default: [] },
  },
  { timestamps: true },
);

export const Tickets: Model<ITicket> =
  (mongoose.models.PortalTicket as Model<ITicket>) ?? mongoose.model<ITicket>('PortalTicket', ticketSchema);
