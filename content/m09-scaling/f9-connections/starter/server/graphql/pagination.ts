import mongoose from 'mongoose';
import { Issue } from '../models/Issue';
import { buildIssueFilter, countIssues, type IssueFilter } from '../repositories/issues';
import { badInput } from './errors';

export function encodeCursor(issue: { createdAt: Date; _id: unknown }): string {
  // TODO
  return '';
}

export function decodeCursor(cursor: string): { createdAt: Date; id: mongoose.Types.ObjectId } {
  // TODO
  throw badInput('Invalid cursor');
}

export async function issueConnection(
  projectId: string,
  filter: IssueFilter = {},
  { first = 20, after }: { first?: number; after?: string | null } = {},
) {
  // TODO
  return { edges: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 };
}
