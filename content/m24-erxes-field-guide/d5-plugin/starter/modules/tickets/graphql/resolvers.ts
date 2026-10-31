import { checkLogin, checkPermission, moduleRequireLogin } from '../../../erxes-api-shared';
import type { IContext } from '../../../connectionResolvers';

export const ticketQueries = {};
export const ticketMutations = {};

// TODO: apply the guards, and add the Ticket type's resolvers.

export const resolvers = {
  Query: ticketQueries,
  Mutation: ticketMutations,
};
