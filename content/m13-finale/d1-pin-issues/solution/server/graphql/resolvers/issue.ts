import mongoose from 'mongoose';
import { Issue } from '../../models/Issue';
import { Comment } from '../../models/Comment';
import { updateIssue, addLabel, removeLabel, countPinnedIssues } from '../../repositories/issues';
import { assertCanWriteProject } from '../../services/permissions';
import { requireUser, forbidden, notFound, badInput } from '../errors';
import { parseDateOnly, formatDateOnly, startOfTodayUTC } from '../../lib/dates';
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
  status: string;
  dueDate?: Date | null;
};

const valid = (id: unknown) => mongoose.isValidObjectId(id);
const MAX_PINS = 3;

/** "2026-10-31" → Date; null stays null; anything else is the client's mistake. */
function toDueDate(value: string | null): Date | null {
  if (value === null) return null;
  const date = parseDateOnly(value);
  if (!date) throw badInput('dueDate must be a date like 2026-10-31', { dueDate: 'Use the format YYYY-MM-DD' });
  return date;
}

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
      const { projectId, assigneeId, dueDate, ...rest } = input;
      const due = dueDate ? toDueDate(dueDate) : null;
      await assertCanWriteProject(user, projectId);
      return (Issue as any).createInProject(projectId, { ...rest, dueDate: due, assignee: assigneeId ?? null, reporter: user._id });
    },
    updateIssue: async (_: unknown, { id, input }: { id: string; input: any }, ctx: Context) => {
      await loadWritableIssue(ctx, id);
      const { assigneeId, dueDate, ...patch } = input;
      if (assigneeId !== undefined) patch.assignee = assigneeId;
      // omitted → leave alone; null → clear; a string → parse
      if (dueDate !== undefined) patch.dueDate = toDueDate(dueDate);
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
    setIssuePinned: async (_: unknown, { id, pinned }: { id: string; pinned: boolean }, ctx: Context) => {
      const { issue } = await loadWritableIssue(ctx, id);
      // Only a new pin can break the limit: unpinning, or pinning twice, adds nothing.
      if (pinned && !issue.pinned && (await countPinnedIssues(issue.project)) >= MAX_PINS) {
        throw badInput(`A project can have at most ${MAX_PINS} pinned issues`);
      }
      issue.pinned = pinned;
      return issue.save();
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
    dueDate: (i: IssueDoc) => (i.dueDate ? formatDateOnly(i.dueDate) : null),
    isOverdue: (i: IssueDoc) => !!i.dueDate && i.status !== 'DONE' && new Date(i.dueDate) < startOfTodayUTC(),
  },
};
