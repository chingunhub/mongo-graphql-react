// Worked example: the user domain's resolvers. Read this first.
import { listUsers } from '../../models/User';
import type { Context } from './types';

export const userResolvers = {
  Query: {
    users: () => listUsers(),
    // The context arrives as the 3rd argument. For now the tests put `currentUser` in it directly;
    // in module 8 you'll build it from the request's Authorization header.
    me: (_parent: unknown, _args: unknown, ctx: Context) => ctx.currentUser ?? null,
  },
  User: {
    // Works for documents and lean objects alike.
    id: (user: { _id: unknown }) => String(user._id),
    // name, email, role: the default resolver reads them straight off the document.
  },
};
