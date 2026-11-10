import { Tickets, type CPUser } from '../store';
import type { Context } from './context';
import { markResolvers, type Resolver } from './guards';

const ownerKey = (cpUser: CPUser) => `cp:${cpUser.erxesCustomerId || cpUser._id}`;

/** Works on a login page too: it answers null when nobody is signed in. */
export const cpAccountQueries: Record<string, Resolver> = {
  async cpCurrentUser(_root, _args, { cpUser }: Context) {
    return cpUser ? { _id: cpUser._id, email: cpUser.email } : null;
  },
};

export const cpTicketQueries: Record<string, Resolver> = {
  async cpGetTickets(_root, _args, { cpUser, clientPortal }: Context) {
    return Tickets.find({ userId: ownerKey(cpUser!), clientPortalId: clientPortal!._id });
  },

  async cpGetTicket(_root, { _id }: { _id: string }) {
    const ticket = await Tickets.findOne({ _id });
    if (!ticket) throw new Error('Ticket not found');
    return ticket;
  },
};

markResolvers(cpAccountQueries, { forClientPortal: true });
markResolvers(cpTicketQueries, { forClientPortal: true, cpUserRequired: true });
