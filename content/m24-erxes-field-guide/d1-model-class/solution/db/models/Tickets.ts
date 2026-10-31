import type { Model } from 'mongoose';
import type { IModels } from '../../connectionResolvers';
import { ticketSchema, type ITicket, type ITicketDocument } from '../definitions/tickets';

export interface ITicketModel extends Model<ITicket> {
  getTicket(_id: string): Promise<ITicketDocument>;
  createTicket(doc: { sourceId: string; subject: string }): Promise<ITicketDocument>;
  closeTicket(_id: string): Promise<ITicketDocument>;
}

export const loadTicketClass = (models: IModels) => {
  class Ticket {
    public static async getTicket(_id: string) {
      const ticket = await models.Tickets.findOne({ _id });
      if (!ticket) throw new Error('Ticket not found');
      return ticket;
    }

    public static async createTicket(doc: { sourceId: string; subject: string }) {
      try {
        return await models.Tickets.create(doc);
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        const existing = await models.Tickets.findOne({ sourceId: doc.sourceId });
        if (!existing) throw error;
        return existing;
      }
    }

    public static async closeTicket(_id: string) {
      const closed = await models.Tickets.findOneAndUpdate(
        { _id, status: 'open' },
        { $set: { status: 'closed' } },
        { returnDocument: 'after' },
      );
      if (closed) return closed;
      await models.Tickets.getTicket(_id);
      throw new Error('Ticket already closed');
    }
  }

  ticketSchema.loadClass(Ticket);
  return ticketSchema;
};
