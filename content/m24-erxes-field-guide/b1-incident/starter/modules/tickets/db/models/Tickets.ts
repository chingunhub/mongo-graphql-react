import type { Model } from 'mongoose';
import { currentModels } from '../../../../connectionResolvers';
import { ticketSchema, type ITicket, type ITicketDocument } from '../definitions/tickets';

export interface ITicketModel extends Model<ITicket> {
  getTicket(_id: string): Promise<ITicketDocument>;
  closeTicket(_id: string): Promise<ITicketDocument>;
  summarize(): Promise<{ open: number; closed: number }>;
}

export const loadTicketClass = () => {
  class Ticket {
    public static async getTicket(_id: string) {
      const { Tickets } = currentModels();
      const ticket = await Tickets.findOne({ _id });
      if (!ticket) throw new Error('Ticket not found');
      return ticket;
    }

    public static async closeTicket(_id: string) {
      const { Tickets } = currentModels();
      const ticket = await Tickets.findOneAndUpdate(
        { _id },
        { $set: { status: 'closed' } },
        { returnDocument: 'after' },
      );
      if (!ticket) throw new Error('Ticket not found');
      return ticket;
    }

    public static async summarize() {
      const { Tickets } = currentModels();
      const [open, closed] = await Promise.all([
        Tickets.countDocuments({ status: 'open' }),
        Tickets.countDocuments({ status: 'closed' }),
      ]);
      return { open, closed };
    }
  }

  ticketSchema.loadClass(Ticket);
  return ticketSchema;
};
