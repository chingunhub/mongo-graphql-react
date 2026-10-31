import type { Model } from 'mongoose';
import type { IModels } from '../../../../connectionResolvers';
import { ticketSchema, type ITicket, type ITicketDocument } from '../definitions/tickets';

export interface ITicketModel extends Model<ITicket> {
  getTicket(_id: string): Promise<ITicketDocument>;
  raiseTicket(_id: string): Promise<ITicketDocument>;
}

export const loadTicketClass = (models: IModels) => {
  // TODO: the statics from the brief
  return ticketSchema;
};
