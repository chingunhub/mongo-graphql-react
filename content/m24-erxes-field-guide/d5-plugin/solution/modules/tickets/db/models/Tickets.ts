import type { Model } from 'mongoose';
import type { IModels } from '../../../../connectionResolvers';
import { ticketSchema, type ITicket, type ITicketDocument } from '../definitions/tickets';

export interface ITicketModel extends Model<ITicket> {
  getTicket(_id: string): Promise<ITicketDocument>;
  raiseTicket(_id: string): Promise<ITicketDocument>;
}

export const loadTicketClass = (models: IModels) => {
  class Ticket {
    public static async getTicket(_id: string) {
      const ticket = await models.Tickets.findOne({ _id });
      if (!ticket) throw new Error('Ticket not found');
      return ticket;
    }

    public static async raiseTicket(_id: string) {
      const ticket = await models.Tickets.findOneAndUpdate(
        { _id },
        { $set: { priority: 'high' } },
        { returnDocument: 'after' },
      );
      if (!ticket) throw new Error('Ticket not found');
      return ticket;
    }
  }

  ticketSchema.loadClass(Ticket);
  return ticketSchema;
};
