import { User, listUsers } from '../../models/User';
import { signToken } from '../../auth/tokens';
import { unauthenticated } from '../errors';
import type { Context } from './types';

type UserDoc = { _id: unknown; email: string };

const authPayload = (user: any) => ({ token: signToken(String(user._id)), user });

export const userResolvers = {
  Query: {
    users: () => listUsers(),
    me: (_parent: unknown, _args: unknown, ctx: Context) => ctx.currentUser ?? null,
  },
  Mutation: {
    signUp: async (_: unknown, { input }: { input: { name: string; email: string; password: string } }) => {
      // Validation (password length) and duplicates (unique email) surface through formatError.
      const user = await User.create({ name: input.name, email: input.email, password: input.password });
      return authPayload(user);
    },
    login: async (_: unknown, { email, password }: { email: string; password: string }) => {
      const user = await (User as any).findByCredentials(email, password);
      // Same message for "no such email" and "wrong password": don't reveal which emails exist.
      if (!user) throw unauthenticated('Invalid email or password');
      return authPayload(user);
    },
  },
  User: {
    id: (user: { _id: unknown }) => String(user._id),
    // Field-level authorization: the value depends on who's asking. Return null, don't throw.
    email: (user: UserDoc, _args: unknown, ctx: Context) => {
      const me = ctx.currentUser;
      if (!me) return null;
      return me.role === 'ADMIN' || String(me._id) === String(user._id) ? user.email : null;
    },
  },
};

