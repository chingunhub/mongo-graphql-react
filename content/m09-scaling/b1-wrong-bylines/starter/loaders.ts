import DataLoader from 'dataloader';
import mongoose from 'mongoose';
import { Author } from './models/Author';
import { Comment } from './models/Comment';

export function createLoaders() {
  return {
    authorById: new DataLoader<string, any>(async (ids) => {
      return Author.find({ _id: { $in: ids } }).lean();
    }),
    commentCountByArticle: new DataLoader<string, number>(async (ids) => {
      const rows = await Comment.aggregate([
        { $match: { article: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
        { $group: { _id: '$article', n: { $sum: 1 } } },
      ]);
      return rows.map((row) => row.n);
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
