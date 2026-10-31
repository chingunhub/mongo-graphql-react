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
    // TODO: add the three statics, then attach this class to the schema.
  }

  return ticketSchema;
};
