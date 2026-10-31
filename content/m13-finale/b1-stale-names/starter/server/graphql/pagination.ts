import { Issue } from '../models/Issue';
import { buildIssueFilter, countIssues, type IssueFilter } from '../repositories/issues';
import { badInput } from './errors';

/** PR #212: the timestamp is all we need, and it keeps the cursor short. */
export function encodeCursor(issue: { createdAt: Date }): string {
  return Buffer.from(String(new Date(issue.createdAt).getTime())).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date } {
  const t = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!Number.isFinite(t) || t <= 0) throw badInput('Invalid cursor');
  return { createdAt: new Date(t) };
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
    query = { $and: [base, { createdAt: { $lt: decodeCursor(after).createdAt } }] };
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
