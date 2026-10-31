import type { Model } from 'mongoose';
import type { IModels } from '../../../../connectionResolvers';
import { ticketSchema, type ITicket, type ITicketDocument } from '../definitions/tickets';

export interface ITicketModel extends Model<ITicket> {
  getTicket(_id: string): Promise<ITicketDocument>;
  closeTicket(_id: string): Promise<ITicketDocument>;
  summarize(): Promise<{ open: number; closed: number }>;
}

export const loadTicketClass = (models: IModels) => {
  class Ticket {
    public static async getTicket(_id: string) {
      const ticket = await models.Tickets.findOne({ _id });
      if (!ticket) throw new Error('Ticket not found');
      return ticket;
    }

    public static async closeTicket(_id: string) {
      const ticket = await models.Tickets.findOneAndUpdate(
        { _id },
        { $set: { status: 'closed' } },
        { returnDocument: 'after' },
      );
      if (!ticket) throw new Error('Ticket not found');
      return ticket;
    }

    public static async summarize() {
      const [open, closed] = await Promise.all([
        models.Tickets.countDocuments({ status: 'open' }),
        models.Tickets.countDocuments({ status: 'closed' }),
      ]);
      return { open, closed };
    }
  }

  ticketSchema.loadClass(Ticket);
  return ticketSchema;
};
