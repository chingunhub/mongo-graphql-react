import mongoose from 'mongoose';
import { Project } from '../../models/Project';
import { User } from '../../models/User';
import { listIssues, countIssues } from '../../repositories/issues';
import { projectStats, workload } from '../../services/stats';
import { idOf, notFound } from './util';
import type { Context } from './types';

type ProjectDoc = { _id: unknown; owner: unknown; members: unknown[] };

export const projectResolvers = {
  Query: {
    projects: () => Project.find().sort({ name: 1 }).exec(),
    project: (_: unknown, { key }: { key: string }) => Project.findOne({ key }).exec(),
  },
  Mutation: {
    createProject: (_: unknown, { input }: { input: Record<string, unknown> }, ctx: Context) =>
      Project.create({ ...input, owner: ctx.currentUser._id, members: [ctx.currentUser._id] }),
    addMember: async (_: unknown, { projectId, userId }: { projectId: string; userId: string }) => {
      const project = mongoose.isValidObjectId(projectId)
        ? await Project.findByIdAndUpdate(projectId, { $addToSet: { members: userId } }, { returnDocument: 'after' })
        : null;
      if (!project) throw notFound('Project');
      return project;
    },
  },
  Project: {
    id: (p: ProjectDoc) => String(p._id),
    owner: (p: ProjectDoc) => User.findById(idOf(p.owner)).exec(),
    members: (p: ProjectDoc) => User.find({ _id: { $in: p.members.map(idOf) } }).sort({ name: 1 }).exec(),
    issues: (p: ProjectDoc, { filter, sort, limit, offset }: any) =>
      listIssues(String(p._id), filter ?? {}, { sort, limit, offset }),
    issueCount: (p: ProjectDoc, { filter }: any) => countIssues(String(p._id), filter ?? {}),
    stats: async (p: ProjectDoc) => {
      const [stats, load] = await Promise.all([projectStats(String(p._id)), workload(String(p._id))]);
      return { ...stats, workload: load };
    },
  },
  Workload: {
    user: (w: { userId: string }) => User.findById(w.userId).exec(),
  },
};
