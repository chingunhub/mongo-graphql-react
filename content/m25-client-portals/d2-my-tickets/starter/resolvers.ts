import mongoose from 'mongoose';
import { markResolvers, type Context, type CPUser, type Resolver } from './guards';
import { Tickets } from './Tickets';

/** The value stored in a ticket's `userId` for this customer. */
export function ownerKey(cpUser: CPUser): string {
  throw new Error('TODO: the linked customer, or the account itself');
}

export const cpTicketQueries: Record<string, Resolver> = {
  async cpGetTickets(_root, args: { status?: string }, context: Context) {
    throw new Error('TODO: this customer\'s tickets in this portal, newest first');
  },

  async cpGetTicket(_root, args: { _id: string }, context: Context) {
    throw new Error('TODO: one ticket, if it is theirs');
  },
};

export const cpTicketMutations: Record<string, Resolver> = {
  async cpCreateTicket(_root, args: { subject: string; description?: string }, context: Context) {
    throw new Error('TODO: file a ticket for this customer');
  },

  async cpAddReply(_root, args: { _id: string; body: string }, context: Context) {
    throw new Error('TODO: add a reply to their own ticket');
  },
};

// TODO: mark both objects as portal operations that need a signed-in customer.
