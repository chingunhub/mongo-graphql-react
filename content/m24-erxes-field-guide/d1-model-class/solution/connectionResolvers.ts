import mongoose from 'mongoose';
import type { ITicket } from './db/definitions/tickets';
import { loadTicketClass, type ITicketModel } from './db/models/Tickets';

export interface IModels {
  Tickets: ITicketModel;
}

export function databaseName(subdomain: string): string {
  if (!/^[a-z0-9-]{1,20}$/.test(subdomain)) throw new Error('Invalid subdomain');
  return `${mongoose.connection.name}_${subdomain}`;
}

export function loadClasses(db: mongoose.Connection): IModels {
  const models = {} as IModels;
  models.Tickets = db.model<ITicket, ITicketModel>('tickets', loadTicketClass(models));
  return models;
}

const loaded = new Map<string, Promise<IModels>>();

export function generateModels(subdomain: string): Promise<IModels> {
  const name = databaseName(subdomain);
  const existing = loaded.get(subdomain);
  if (existing) return existing;
  const pending = (async () => {
    const models = loadClasses(mongoose.connection.useDb(name, { useCache: true }));
    await models.Tickets.init();
    return models;
  })();
  loaded.set(subdomain, pending);
  return pending;
}
