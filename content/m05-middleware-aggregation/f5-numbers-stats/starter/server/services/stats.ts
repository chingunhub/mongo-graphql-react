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
  // TODO
  return { total: 0, byStatus: [] };
}

export async function workload(projectId: string): Promise<Workload[]> {
  // TODO
  return [];
}
