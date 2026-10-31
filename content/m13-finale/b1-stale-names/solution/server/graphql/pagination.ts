import mongoose from 'mongoose';
import { Issue } from '../models/Issue';
import { buildIssueFilter, countIssues, type IssueFilter } from '../repositories/issues';
import { badInput } from './errors';

/** Opaque cursor: base64url of [createdAt ms, _id] — both sort keys, so ties are unambiguous. */
export function encodeCursor(issue: { createdAt: Date; _id: unknown }): string {
  return Buffer.from(JSON.stringify([new Date(issue.createdAt).getTime(), String(issue._id)])).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: mongoose.Types.ObjectId } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const [t, id] = Array.isArray(parsed) ? parsed : [];
    if (typeof t !== 'number' || typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) throw new Error();
    return { createdAt: new Date(t), id: new mongoose.Types.ObjectId(id) };
  } catch {
    throw badInput('Invalid cursor');
  }
}

export async function issueConnection(
  projectId: string,
  filter: IssueFilter = {},
  { first = 20, after }: { first?: number; after?: string | null } = {},
) {
  if (!Number.isInteger(first) || first < 1 || first > 50) throw badInput('first must be between 1 and 50');

  const base = buildIssueFilter(projectId, filter);
  let query: Record<string, unknown> = base;
  if (after) {
    const c = decodeCursor(after);
    query = {
      $and: [base, { $or: [{ createdAt: { $lt: c.createdAt } }, { createdAt: c.createdAt, _id: { $lt: c.id } }] }],
    };
  }

  const docs = await Issue.find(query).sort({ createdAt: -1, _id: -1 }).limit(first + 1);
  const page = docs.slice(0, first);
  const edges = page.map((node) => ({ cursor: encodeCursor(node), node }));
  return {
    edges,
    pageInfo: { hasNextPage: docs.length > first, endCursor: edges.at(-1)?.cursor ?? null },
    // A function: the default resolver only calls it if the client selected totalCount.
    totalCount: () => countIssues(projectId, filter),
  };
}
