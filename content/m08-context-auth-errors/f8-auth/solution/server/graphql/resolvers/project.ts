import mongoose from 'mongoose';
import { Project } from '../../models/Project';
import { User } from '../../models/User';
import { listIssues, countIssues } from '../../repositories/issues';
import { projectStats, workload } from '../../services/stats';
import { requireUser, forbidden, notFound } from '../errors';
import { idOf } from './util';
import type { Context } from './types';

type ProjectDoc = { _id: unknown; owner: unknown; members: unknown[] };

export const projectResolvers = {
  Query: {
    projects: () => Project.find().sort({ name: 1 }).exec(),
    project: (_: unknown, { key }: { key: string }) => Project.findOne({ key }).exec(),
  },
  Mutation: {
    createProject: (_: unknown, { input }: { input: Record<string, unknown> }, ctx: Context) => {
      const user = requireUser(ctx);
      return Project.create({ ...input, owner: user._id, members: [user._id] });
    },
    addMember: async (_: unknown, { projectId, userId }: { projectId: string; userId: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const project = mongoose.isValidObjectId(projectId) ? await Project.findById(projectId) : null;
      if (!project) throw notFound('Project');
      // Only the owner (or an admin) manages membership.
      if (user.role !== 'ADMIN' && String(project.owner) !== String(user._id)) {
        throw forbidden('Only the project owner can add members');
      }
      if (!mongoose.isValidObjectId(userId) || !(await User.exists({ _id: userId }))) throw notFound('User');
      return Project.findByIdAndUpdate(projectId, { $addToSet: { members: userId } }, { returnDocument: 'after' }).exec();
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
