import mongoose from 'mongoose';
import { sessionSchema, type ISessionModel } from './utils/auth';
import { loadTicketClass, type ITicketModel } from './modules/tickets/db/models/Tickets';
import type { ITicket } from './modules/tickets/db/definitions/tickets';

export interface IModels {
  Tickets: ITicketModel;
  Sessions: ISessionModel;
}

const loadClasses = (db: mongoose.Connection): IModels => {
  const models = {} as IModels;
  models.Tickets = db.model<ITicket, ITicketModel>('tickets', loadTicketClass());
  models.Sessions = db.model('sessions', sessionSchema) as ISessionModel;
  return models;
};

const loaded = new Map<string, Promise<IModels>>();
let active: IModels;

// Helpers can reach the right models without having them passed around.
export const currentModels = () => active;

export const generateModels = async (subdomain: string) => {
  let pending = loaded.get(subdomain);
  if (!pending) {
    const db = mongoose.connection.useDb(`${mongoose.connection.name}_${subdomain}`, { useCache: true });
    pending = Promise.resolve(loadClasses(db));
    loaded.set(subdomain, pending);
  }
  const models = await pending;
  active = models;
  return models;
};
