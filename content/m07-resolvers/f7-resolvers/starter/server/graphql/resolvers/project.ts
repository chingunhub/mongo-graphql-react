import mongoose from 'mongoose';
import { Project } from '../../models/Project';
import { User } from '../../models/User';
import { listIssues, countIssues } from '../../repositories/issues';
import { projectStats, workload } from '../../services/stats';
import { idOf, notFound } from './util';
import type { Context } from './types';

export const projectResolvers = {
  Query: {
    projects: () => Project.find().sort({ name: 1 }).exec(),
    project: (_: unknown, { key }: { key: string }) => Project.findOne({ key }).exec(),
  },
  Mutation: {
    // TODO createProject(input): owner = the current user, who is also the first member
    // TODO addMember(projectId, userId): add without duplicates; unknown project → notFound('Project')
  },
  Project: {
    // TODO id, owner, members
    // TODO issues(filter, sort, limit, offset) and issueCount(filter) — use your repository
    // TODO stats — { total, byStatus } from projectStats, plus workload
  },
  Workload: {
    // TODO user — the workload rows from your stats service have a userId
  },
};
