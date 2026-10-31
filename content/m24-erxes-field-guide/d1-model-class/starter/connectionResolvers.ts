import mongoose from 'mongoose';
import type { ITicket } from './db/definitions/tickets';
import { loadTicketClass, type ITicketModel } from './db/models/Tickets';

export interface IModels {
  Tickets: ITicketModel;
}

export function databaseName(subdomain: string): string {
  throw new Error('TODO: validate the subdomain and name its database');
}

export function loadClasses(db: mongoose.Connection): IModels {
  throw new Error('TODO: build the models object on this connection');
}

export async function generateModels(subdomain: string): Promise<IModels> {
  throw new Error('TODO: return the models for this subdomain');
}
