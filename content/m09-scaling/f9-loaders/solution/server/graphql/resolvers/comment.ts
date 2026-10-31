import mongoose from 'mongoose';
import { Issue } from '../../models/Issue';
import { addComment } from '../../repositories/comments';
import { assertCanWriteProject } from '../../services/permissions';
import { requireUser, notFound } from '../errors';
import { idOf, toISO } from './util';
import type { Context } from './types';

type CommentDoc = { _id: unknown; author: unknown; createdAt: Date };

export const commentResolvers = {
  Mutation: {
    addComment: async (_: unknown, { issueId, body }: { issueId: string; body: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const issue = mongoose.isValidObjectId(issueId) ? await Issue.findById(issueId).select('project') : null;
      if (!issue) throw notFound('Issue');
      await assertCanWriteProject(user, issue.project);
      return addComment(issueId, String(user._id), body);
    },
  },
  Comment: {
    id: (c: CommentDoc) => String(c._id),
    // author may already be populated (from the repository) — idOf handles both.
    author: (c: CommentDoc, _: unknown, ctx: Context) => ctx.loaders.userById.load(String(idOf(c.author))),
    createdAt: (c: CommentDoc) => toISO(c.createdAt),
  },
};
