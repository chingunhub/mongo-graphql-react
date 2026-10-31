import mongoose from 'mongoose';
import { Issue } from '../../models/Issue';
import { Project } from '../../models/Project';
import { User } from '../../models/User';
import { Comment } from '../../models/Comment';
import { updateIssue, addLabel, removeLabel } from '../../repositories/issues';
import { listComments } from '../../repositories/comments';
import { idOf, toISO, notFound } from './util';
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

export const issueResolvers = {
  Query: {
    issue: async (_: unknown, { id }: { id: string }) => (valid(id) ? await Issue.findById(id) : null),
  },
  Mutation: {
    createIssue: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      const { projectId, assigneeId, ...rest } = input;
      if (!valid(projectId) || !(await Project.exists({ _id: projectId }))) throw notFound('Project');
      return (Issue as any).createInProject(projectId, {
        ...rest,
        assignee: assigneeId ?? null,
        reporter: ctx.currentUser._id,
      });
    },
    updateIssue: async (_: unknown, { id, input }: { id: string; input: any }) => {
      const { assigneeId, ...patch } = input;
      // omitted → leave alone; explicit null → unassign
      if (assigneeId !== undefined) patch.assignee = assigneeId;
      const issue = valid(id) ? await updateIssue(id, patch) : null;
      if (!issue) throw notFound('Issue');
      return issue;
    },
    deleteIssue: async (_: unknown, { id }: { id: string }) => {
      const issue = valid(id) ? await Issue.findByIdAndDelete(id) : null;
      if (!issue) throw notFound('Issue');
      await Comment.deleteMany({ issue: issue._id });
      return String(issue._id);
    },
    addLabel: async (_: unknown, { issueId, label }: { issueId: string; label: { name: string; color?: string } }) => {
      const issue = valid(issueId) ? await addLabel(issueId, label) : null;
      if (!issue) throw notFound('Issue');
      return issue;
    },
    removeLabel: async (_: unknown, { issueId, name }: { issueId: string; name: string }) => {
      const issue = valid(issueId) ? await removeLabel(issueId, name) : null;
      if (!issue) throw notFound('Issue');
      return issue;
    },
  },
  Issue: {
    id: (i: IssueDoc) => String(i._id),
    key: async (i: IssueDoc) => {
      const project = await Project.findById(idOf(i.project)).select('key').exec();
      return `${project?.key}-${i.number}`;
    },
    project: (i: IssueDoc) => Project.findById(idOf(i.project)).exec(),
    reporter: (i: IssueDoc) => User.findById(idOf(i.reporter)).exec(),
    assignee: (i: IssueDoc) => (i.assignee ? User.findById(idOf(i.assignee)).exec() : null),
    comments: (i: IssueDoc) => listComments(String(i._id)),
    commentCount: (i: IssueDoc) => Comment.countDocuments({ issue: i._id }).exec(),
    createdAt: (i: IssueDoc) => toISO(i.createdAt),
    updatedAt: (i: IssueDoc) => toISO(i.updatedAt),
  },
};
