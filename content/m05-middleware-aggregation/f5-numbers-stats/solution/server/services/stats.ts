import mongoose from 'mongoose';
import { Issue, STATUSES, type Status } from '../models/Issue';
import '../models/User';

export interface ProjectStats {
  total: number;
  byStatus: { status: Status; count: number }[];
}

export interface Workload {
  userId: string;
  name: string;
  open: number;
}

export async function projectStats(projectId: string): Promise<ProjectStats> {
  // Aggregation doesn't cast through the schema — do it ourselves.
  const project = new mongoose.Types.ObjectId(projectId);
  const rows: { _id: Status; count: number }[] = await Issue.aggregate([
    { $match: { project } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  // $group only returns statuses that occur; the board needs all four.
  const byStatus = STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  return { total: byStatus.reduce((sum, s) => sum + s.count, 0), byStatus };
}

export async function workload(projectId: string): Promise<Workload[]> {
  const project = new mongoose.Types.ObjectId(projectId);
  return Issue.aggregate([
    { $match: { project, status: { $ne: 'DONE' }, assignee: { $ne: null } } },
    { $group: { _id: '$assignee', open: { $sum: 1 } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $project: { _id: 0, userId: { $toString: '$_id' }, name: '$user.name', open: 1 } },
    { $sort: { open: -1, name: 1 } },
  ]);
}
