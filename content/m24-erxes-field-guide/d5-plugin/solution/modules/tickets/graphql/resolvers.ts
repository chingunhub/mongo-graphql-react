import { checkLogin, checkPermission, moduleRequireLogin } from '../../../erxes-api-shared';
import type { IContext } from '../../../connectionResolvers';
import type { ITicket } from '../db/definitions/tickets';

export const ticketQueries = {
  tickets(_root: unknown, { priority }: { priority?: string | null }, { models }: IContext) {
    return models.Tickets.find(priority ? { priority } : {});
  },
  ticket(_root: unknown, { _id }: { _id: string }, { models }: IContext) {
    return models.Tickets.getTicket(_id);
  },
};

export const ticketMutations = {
  ticketAdd(_root: unknown, doc: { subject: string; contactId?: string | null }, { models }: IContext) {
    return models.Tickets.create({ subject: doc.subject, contactId: doc.contactId ?? undefined });
  },
  ticketRaise(_root: unknown, { _id }: { _id: string }, { models }: IContext) {
    return models.Tickets.raiseTicket(_id);
  },
};

moduleRequireLogin(ticketQueries);
moduleRequireLogin(ticketMutations);
checkPermission(ticketMutations, 'ticketRaise', 'tickets:manage');

export const Ticket = {
  __resolveReference({ _id }: { _id: string }, { models, user }: IContext) {
    checkLogin(user);
    return models.Tickets.findOne({ _id });
  },
  contact({ contactId }: ITicket, _args: unknown, { loaders }: IContext) {
    return contactId ? loaders.contact.load(contactId) : null;
  },
};

export const resolvers = {
  Query: ticketQueries,
  Mutation: ticketMutations,
  Ticket,
};
