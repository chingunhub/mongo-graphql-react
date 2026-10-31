import type DataLoader from 'dataloader';
import type mongoose from 'mongoose';
import { createGenerateModels, type User } from './erxes-api-shared';
import type { ITicketModel } from './modules/tickets/db/models/Tickets';

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
  throw new Error('TODO: build the models on this connection');
};

export const generateModels = createGenerateModels<any>(loadClasses) as (subdomain: string) => Promise<IModels>;
