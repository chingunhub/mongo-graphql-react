import { Issue, type Status, type Priority } from '../models/Issue';

export interface IssueFilter {
  status?: Status;
  priority?: Priority;
  /** a user id, or null for "unassigned" */
  assigneeId?: string | null;
  label?: string;
  search?: string;
}

export type IssueSort = 'NEWEST' | 'OLDEST' | 'UPDATED';

export interface ListOptions {
  sort?: IssueSort;
  limit?: number;
  offset?: number;
}

export interface IssuePatch {
  title?: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  assignee?: string | null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS: Record<IssueSort, Record<string, 1 | -1>> = {
  NEWEST: { createdAt: -1, _id: -1 },
  OLDEST: { createdAt: 1, _id: 1 },
  UPDATED: { updatedAt: -1, _id: -1 },
};

const PATCHABLE = ['title', 'description', 'status', 'priority', 'assignee'] as const;

export function buildIssueFilter(projectId: string, filter: IssueFilter = {}): Record<string, unknown> {
  const q: Record<string, unknown> = { project: projectId };
  if (filter.status) q.status = filter.status;
  if (filter.priority) q.priority = filter.priority;
  // undefined = "don't filter"; null = "unassigned"
  if (filter.assigneeId !== undefined) q.assignee = filter.assigneeId;
  if (filter.label) q['labels.name'] = filter.label.trim().toLowerCase();
  if (filter.search?.trim()) q.title = { $regex: escapeRegex(filter.search.trim()), $options: 'i' };
  return q;
}

export async function listIssues(projectId: string, filter: IssueFilter = {}, options: ListOptions = {}) {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = Math.max(0, options.offset ?? 0);
  return Issue.find(buildIssueFilter(projectId, filter))
    .sort(SORTS[options.sort ?? 'NEWEST'] ?? SORTS.NEWEST)
    .skip(offset)
    .limit(limit);
}

export async function countIssues(projectId: string, filter: IssueFilter = {}) {
  return Issue.countDocuments(buildIssueFilter(projectId, filter));
}

export async function updateIssue(id: string, patch: IssuePatch) {
  const $set: Record<string, unknown> = {};
  for (const key of PATCHABLE) {
    if (patch[key] !== undefined) $set[key] = patch[key];
  }
  if (Object.keys($set).length === 0) return Issue.findById(id);
  return Issue.findByIdAndUpdate(id, { $set }, { returnDocument: 'after', runValidators: true });
}

export async function addLabel(issueId: string, label: { name: string; color?: string }) {
  const name = label.name.trim().toLowerCase();
  // Condition + push in one atomic step: concurrent calls can't add the same name twice.
  const updated = await Issue.findOneAndUpdate(
    { _id: issueId, 'labels.name': { $ne: name } },
    { $push: { labels: { ...label, name } } },
    { returnDocument: 'after', runValidators: true },
  );
  // null means: no such issue, or it already had the label.
  return updated ?? Issue.findById(issueId);
}

export async function removeLabel(issueId: string, name: string) {
  return Issue.findByIdAndUpdate(
    issueId,
    { $pull: { labels: { name: name.trim().toLowerCase() } } },
    { returnDocument: 'after' },
  );
}
