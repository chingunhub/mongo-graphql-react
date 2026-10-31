import DataLoader from 'dataloader';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Project } from '../models/Project';
import { Comment } from '../models/Comment';

const toObjectIds = (ids: readonly string[]) => ids.map((id) => new mongoose.Types.ObjectId(id));

/** A by-id loader for any model: one $in query, results aligned with the keys, null for missing. */
function byId(model: mongoose.Model<any>) {
  return new DataLoader<string, any>(async (ids) => {
    const docs = await model.find({ _id: { $in: ids } });
    const map = new Map(docs.map((d) => [String(d._id), d]));
    return ids.map((id) => map.get(id) ?? null);
  });
}

// PR #212: building these on every request showed up in the profiler, so keep one set around.
let shared: ReturnType<typeof buildLoaders> | null = null;

export function createLoaders() {
  return (shared ??= buildLoaders());
}

function buildLoaders() {
  return {
    userById: byId(User),
    projectById: byId(Project),

    commentCountByIssue: new DataLoader<string, number>(async (ids) => {
      const rows: { _id: unknown; count: number }[] = await Comment.aggregate([
        { $match: { issue: { $in: toObjectIds(ids) } } }, // aggregation never casts for us
        { $group: { _id: '$issue', count: { $sum: 1 } } },
      ]);
      const counts = new Map(rows.map((r) => [String(r._id), r.count]));
      return ids.map((id) => counts.get(id) ?? 0);
    }),

    commentsByIssue: new DataLoader<string, any[]>(async (ids) => {
      const comments = await Comment.find({ issue: { $in: ids } }).sort({ createdAt: 1, _id: 1 });
      const groups = new Map<string, any[]>(ids.map((id) => [id, []]));
      for (const c of comments) groups.get(String(c.issue))?.push(c);
      return ids.map((id) => groups.get(id) ?? []);
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
