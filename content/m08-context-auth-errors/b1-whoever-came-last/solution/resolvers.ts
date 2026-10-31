import { Expense } from './models/Expense';
import { forbidden, notFound, unauthenticated } from './errors';
import type { Context } from './context';

function requireUser(ctx: Context) {
  if (!ctx.currentUser) throw unauthenticated();
  return ctx.currentUser;
}

async function loadExpense(id: string) {
  const expense = await Expense.findById(id);
  if (!expense) throw notFound();
  return expense;
}

export const resolvers = {
  Query: {
    me: (_: unknown, __: unknown, ctx: Context) => ctx.currentUser,
    myExpenses: (_: unknown, __: unknown, ctx: Context) =>
      Expense.find({ owner: requireUser(ctx)._id }).sort({ title: 1 }).lean().exec(),
  },
  Mutation: {
    updateExpense: async (_: unknown, { id, title }: { id: string; title: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const expense = await loadExpense(id);
      if (!expense.owner.equals(user._id)) throw forbidden();
      expense.title = title;
      return expense.save();
    },
    deleteExpense: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const expense = await loadExpense(id);
      if (!expense.owner.equals(user._id)) throw forbidden();
      await expense.deleteOne();
      return id;
    },
  },
  Expense: {
    id: (expense: any) => String(expense._id),
  },
};
