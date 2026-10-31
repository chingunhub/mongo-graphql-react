import { Article } from './models/Article';
import type { Context } from './context';

export const resolvers = {
  Query: {
    articles: () => Article.find().sort({ publishedAt: -1 }).lean().exec(),
  },
  Article: {
    id: (article: any) => String(article._id),
    author: (article: any, _: unknown, ctx: Context) => ctx.loaders.authorById.load(String(article.author)),
    reviewers: async (article: any, _: unknown, ctx: Context) => {
      const reviewers = await ctx.loaders.authorById.loadMany(article.reviewers.map(String));
      return reviewers.filter(Boolean);
    },
    commentCount: (article: any, _: unknown, ctx: Context) =>
      ctx.loaders.commentCountByArticle.load(String(article._id)),
  },
  Author: {
    id: (author: any) => String(author._id),
  },
};
