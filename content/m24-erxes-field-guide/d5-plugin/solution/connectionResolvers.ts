import type DataLoader from 'dataloader';
import type mongoose from 'mongoose';
import { createGenerateModels, type User } from './erxes-api-shared';
import type { ITicket } from './modules/tickets/db/definitions/tickets';
import { loadTicketClass, type ITicketModel } from './modules/tickets/db/models/Tickets';

export interface IModels {
  Tickets: ITicketModel;
}

export interface IContext {
  subdomain: string;
  user: User | null;
  models: IModels;
  loaders: { contact: DataLoader<string, Contact | null> };
}

export type Contact = { _id: string; name: string };

export const loadClasses = (db: mongoose.Connection, subdomain: string): IModels => {
  const models = {} as IModels;
  models.Tickets = db.model<ITicket, ITicketModel>('tickets', loadTicketClass(models));
  return models;
};

export const generateModels = createGenerateModels<any>(loadClasses) as (subdomain: string) => Promise<IModels>;
