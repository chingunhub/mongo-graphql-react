import DataLoader from 'dataloader';
import mongoose from 'mongoose';
import { Author } from './models/Author';
import { Comment } from './models/Comment';

export function createLoaders() {
  return {
    authorById: new DataLoader<string, any>(async (ids) => {
      const rows = await Author.find({ _id: { $in: ids } }).lean();
      const byId = new Map(rows.map((author) => [String(author._id), author]));
      return ids.map((id) => byId.get(id) ?? null);
    }),
    commentCountByArticle: new DataLoader<string, number>(async (ids) => {
      const rows = await Comment.aggregate([
        { $match: { article: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
        { $group: { _id: '$article', n: { $sum: 1 } } },
      ]);
      const counts = new Map(rows.map((row) => [String(row._id), row.n as number]));
      return ids.map((id) => counts.get(id) ?? 0);
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
