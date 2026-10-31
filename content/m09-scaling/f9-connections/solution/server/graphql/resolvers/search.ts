import { Project } from '../../models/Project';
import { Issue } from '../../models/Issue';
import { User } from '../../models/User';
import { badInput } from '../errors';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const searchResolvers = {
  Query: {
    search: async (_: unknown, { term }: { term: string }) => {
      const t = term.trim();
      if (t.length < 2) throw badInput('Search term must be at least 2 characters');
      const re = { $regex: escapeRegex(t), $options: 'i' };
      const [projects, issues, users] = await Promise.all([
        Project.find({ $or: [{ name: re }, { key: re }] }).sort({ name: 1 }).limit(5),
        Issue.find({ title: re }).sort({ createdAt: -1, _id: -1 }).limit(5),
        User.find({ name: re }).sort({ name: 1 }).limit(5),
      ]);
      return [...projects, ...issues, ...users];
    },
  },
  SearchResult: {
    // GraphQL can't tell a JS object's schema type by looking at it — we have to say.
    __resolveType(obj: unknown) {
      if (obj instanceof Project) return 'Project';
      if (obj instanceof Issue) return 'Issue';
      if (obj instanceof User) return 'User';
      return null;
    },
  },
};
