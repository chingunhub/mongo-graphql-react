import mongoose from 'mongoose';
import { Issue } from '../../models/Issue';
import { Comment } from '../../models/Comment';
import { updateIssue, addLabel, removeLabel } from '../../repositories/issues';
import { assertCanWriteProject } from '../../services/permissions';
import { requireUser, forbidden, notFound } from '../errors';
import { idOf, toISO } from './util';
import type { Context } from './types';

type IssueDoc = {
  _id: unknown;
  number: number;
  project: unknown;
  reporter: unknown;
  assignee: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const valid = (id: unknown) => mongoose.isValidObjectId(id);

/** Load an issue the current user may write to: UNAUTHENTICATED → NOT_FOUND → FORBIDDEN, in that order. */
async function loadWritableIssue(ctx: Context, id: string) {
  const user = requireUser(ctx);
  const issue = valid(id) ? await Issue.findById(id) : null;
  if (!issue) throw notFound('Issue');
  const project = await assertCanWriteProject(user, issue.project);
  return { user, issue, project };
}

export const issueResolvers = {
  Query: {
    issue: async (_: unknown, { id }: { id: string }) => (valid(id) ? await Issue.findById(id) : null),
  },
  Mutation: {
    createIssue: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      const user = requireUser(ctx);
      const { projectId, assigneeId, ...rest } = input;
      await assertCanWriteProject(user, projectId);
      return (Issue as any).createInProject(projectId, { ...rest, assignee: assigneeId ?? null, reporter: user._id });
    },
    updateIssue: async (_: unknown, { id, input }: { id: string; input: any }, ctx: Context) => {
      await loadWritableIssue(ctx, id);
      const { assigneeId, ...patch } = input;
      if (assigneeId !== undefined) patch.assignee = assigneeId;
      return updateIssue(id, patch);
    },
    deleteIssue: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const { user, issue, project } = await loadWritableIssue(ctx, id);
      const allowed =
        user.role === 'ADMIN' || String(issue.reporter) === String(user._id) || String(project.owner) === String(user._id);
      if (!allowed) throw forbidden('Only the reporter or the project owner can delete an issue');
      await Comment.deleteMany({ issue: issue._id });
      await issue.deleteOne();
      return String(issue._id);
    },
    addLabel: async (_: unknown, { issueId, label }: { issueId: string; label: { name: string; color?: string } }, ctx: Context) => {
      await loadWritableIssue(ctx, issueId);
      return addLabel(issueId, label);
    },
    removeLabel: async (_: unknown, { issueId, name }: { issueId: string; name: string }, ctx: Context) => {
      await loadWritableIssue(ctx, issueId);
      return removeLabel(issueId, name);
    },
  },
  Issue: {
    id: (i: IssueDoc) => String(i._id),
    key: async (i: IssueDoc, _: unknown, ctx: Context) => {
      const project = await ctx.loaders.projectById.load(String(idOf(i.project)));
      return `${project?.key}-${i.number}`;
    },
    project: (i: IssueDoc, _: unknown, ctx: Context) => ctx.loaders.projectById.load(String(idOf(i.project))),
    reporter: (i: IssueDoc, _: unknown, ctx: Context) => ctx.loaders.userById.load(String(idOf(i.reporter))),
    assignee: (i: IssueDoc, _: unknown, ctx: Context) =>
      i.assignee ? ctx.loaders.userById.load(String(idOf(i.assignee))) : null,
    comments: (i: IssueDoc, _: unknown, ctx: Context) => ctx.loaders.commentsByIssue.load(String(i._id)),
    commentCount: (i: IssueDoc, _: unknown, ctx: Context) => ctx.loaders.commentCountByIssue.load(String(i._id)),
    createdAt: (i: IssueDoc) => toISO(i.createdAt),
    updatedAt: (i: IssueDoc) => toISO(i.updatedAt),
  },
};
