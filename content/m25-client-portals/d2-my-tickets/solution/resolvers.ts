import mongoose from 'mongoose';
import { markResolvers, type Context, type CPUser, type Resolver } from './guards';
import { Tickets } from './Tickets';

/** The value stored in a ticket's `userId` for this customer. */
export function ownerKey(cpUser: CPUser): string {
  return `cp:${cpUser.erxesCustomerId || cpUser._id}`;
}

/** The filter every portal ticket operation starts from: this customer, in this portal. */
const mine = (context: Context) => ({
  userId: ownerKey(context.cpUser!),
  clientPortalId: context.clientPortal!._id,
});

const STATUSES = ['open', 'answered', 'closed'];

export const cpTicketQueries: Record<string, Resolver> = {
  async cpGetTickets(_root, args: { status?: string }, context: Context) {
    const filter: Record<string, unknown> = mine(context);
    if (args?.status && STATUSES.includes(args.status)) filter.status = args.status;
    return Tickets.find(filter).sort({ createdAt: -1, _id: -1 });
  },

  async cpGetTicket(_root, args: { _id: string }, context: Context) {
    if (!mongoose.isValidObjectId(args?._id)) throw new Error('Ticket not found');
    const ticket = await Tickets.findOne({ _id: args._id, ...mine(context) });
    if (!ticket) throw new Error('Ticket not found');
    return ticket;
  },
};

export const cpTicketMutations: Record<string, Resolver> = {
  async cpCreateTicket(_root, args: { subject: string; description?: string }, context: Context) {
    const subject = typeof args?.subject === 'string' ? args.subject.trim() : '';
    if (!subject) throw new Error('Subject required');
    return Tickets.create({
      subject,
      description: typeof args.description === 'string' ? args.description : undefined,
      status: 'open',
      replies: [],
      ...mine(context),
    });
  },

  async cpAddReply(_root, args: { _id: string; body: string }, context: Context) {
    const body = typeof args?.body === 'string' ? args.body.trim() : '';
    if (!body) throw new Error('Reply required');
    if (!mongoose.isValidObjectId(args._id)) throw new Error('Ticket not found');
    const own = { _id: args._id, ...mine(context) };
    const ticket = await Tickets.findOneAndUpdate(
      { ...own, status: { $ne: 'closed' } },
      {
        $push: { replies: { body, authorId: ownerKey(context.cpUser!), createdAt: new Date() } },
        $set: { status: 'open' },
      },
      { new: true },
    );
    if (ticket) return ticket;
    // Nothing matched: either it isn't theirs, or it is and it's closed.
    if (await Tickets.exists(own)) throw new Error('Ticket is closed');
    throw new Error('Ticket not found');
  },
};

const signedInCustomer = { forClientPortal: true, cpUserRequired: true };
markResolvers(cpTicketQueries, signedInCustomer);
markResolvers(cpTicketMutations, signedInCustomer);
