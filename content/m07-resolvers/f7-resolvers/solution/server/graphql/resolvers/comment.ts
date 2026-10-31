import mongoose from 'mongoose';
import { User } from '../../models/User';
import { addComment } from '../../repositories/comments';
import { idOf, toISO, notFound } from './util';
import type { Context } from './types';

type CommentDoc = { _id: unknown; author: unknown; createdAt: Date };

export const commentResolvers = {
  Mutation: {
    addComment: async (_: unknown, { issueId, body }: { issueId: string; body: string }, ctx: Context) => {
      const comment = mongoose.isValidObjectId(issueId)
        ? await addComment(issueId, String(ctx.currentUser._id), body)
        : null;
      if (!comment) throw notFound('Issue');
      return comment;
    },
  },
  Comment: {
    id: (c: CommentDoc) => String(c._id),
    // author may already be populated (from the repository) — idOf handles both.
    author: (c: CommentDoc) => User.findById(idOf(c.author)).exec(),
    createdAt: (c: CommentDoc) => toISO(c.createdAt),
  },
};
